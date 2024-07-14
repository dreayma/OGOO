/// SPDX-License-Identifier: LGPL3

// Open Group's Open Offer
//
// It is a contract for which the both contract sides are open.
// Anybody can become a shareholder to pay reward.
// Anybody can complete the contract and get the reward.

pragma solidity ^0.8.20;

import { ArrayMap, Map } from "solidity-dynamic-array/contracts/ArrayMap.sol";
import { EnumerableMap } from "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";
import { EnumerableSet } from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

error WrongState(); // The function should not be called in this state of the contract
error WrongParameter(); // The function should not be called with this parameter
error TooLowShareBalance(); // Creating share with the balance less than provided is forbidden
error VotingConflict(); // Happens when the observers voting conflichs with the both, share count and share amount votings
error ProxyForbidden(); // Happens if the ts.origin != msg.sender

abstract contract HasOwner {
    // If a contract is HasOwner, it automatically creates a payable public attribute `owner`
    // equal to the transactuion origin, i.e. initiator of the call sequence leading to
    // the contract instance creation

    error OwnerOnly(); // Only owner allowed to evaluate this operation

    // The attribute relates to the contract owner
    address payable public owner;

    constructor() {
        // The constructor autofills the owner by the transaction origin
        owner = payable(tx.origin);
    }

    // The modifier checks whether the contract owner initiated the call sequence and is
    // a message sender the same owner
    modifier owner_only() {
        // Whether the transaction origin is the owner
        if( tx.origin != address(owner) )
            revert OwnerOnly();
        if( msg.sender != address(owner) )
            revert OwnerOnly();
        _;
    }
    modifier sender_origin() {
        // checks whether the call is directed from the origin immediately
        if( tx.origin != msg.sender )
            revert ProxyForbidden();
        _;
}
}

struct OfferDefinition {
    // Definition of the offer, parameter details
    //
    // Parameter units:
    //  - timeouts in seconds
    //  - amounts in wei
    //  - share is a percentage, 1 = 0.01%, 0 = 0%, 10000=100%,
    //    the percentage is always rounded to the lower bound during the calculation:
    //    1.001% ~= 1.00%, 1.009% ~= 1.00%, 1.019% ~= 1.01%

    string caption;                         // Short one-line caption of the offer
    string description;                     // Longer multiline unformal text description of the offer supporting `.md` format
    string full_details;                    // All legal details of the contract to print as a document, supporting `.md` format, may be compressed
    uint share_unlock_timeout;              // Timeout to unlock an individual share to return to the shareholder
    uint observer_award;                    // Award amount (if present) for each observer

    uint share_min_balance;                 // Minimal share balance to make the share

    // Offer voting bounds. The offer should exceed minimal voting bounds within voting start timeout to make voting available
    uint voting_start_balance;              // Minimal offer balance to start voting
    uint voting_start_count;                // Minimal number of the offer shareholders to start voting
    uint voting_start_timeout;              // The offer should exceed minimal voting bounds after approve within this timeout, or the offer has failed
    uint voting_fail_timeout;               // The offer voting should be completed after approve within this timeout, or the offer has failed

    // Shareholder voting parameters
    uint16 observers_vote_share;                      // Observers vote share (% of total count) to agree the observer's vote
    uint16 shareholders_vote_share;                   // Shareholders vote share (% of total count) to agree the shareholder's vote
    uint16 shareholders_vote_amount_share;            // Shareholders vote share (% of total amount) to agree the shareholder's vote
}

enum OfferState {
    INITIAL,
    APPROVED,
    COMPLETED,
    FAILED
}

uint constant CONTRACT_FAILED = 1 << 255;

contract Offer is HasOwner {
    // The open offer proposes the people's contract to be completed by any contractor.
    // The contract is paid by the offer shareholders community.
    //
    // The offer shareholders vote for the particular contractor when the contract conditions
    // are met, or for the contract failure, if the conrtract can not be completed for any reason.
    //
    // The offer can have some number of observers who also vote for the contractor
    // or the contract failure. If observers are present, their voting should match
    // with the shareholders' voting to have the contract completed successfully
    //
    // When the offer owner creates the offer, he sets up it's definition,
    // and adds independent observers. The offer owner can change the contract
    // until the contract is agreed by him. After that, no any changes available
    // to the contract parameters, or the list of observers, and only shareholders
    // and observers are mutually controlling the contract state.
    //
    // People become shareholders by contributing their share, thereby agreeing to the details of the contract.
    //
    // Shareholders and observers control the contract state voting for changes.
    //
    // If the contract is completed, all collected amount is moved to the voted contractor immediately
    //
    // Failed contract unlocks all shares and their owners can return funds back.
    //
    // If the observer's award is not zero, their awards are moved to the observer's contracts,
    // compensating proportionally from shares funds [TODO]
    //
    // The shareholder may request unlocking it's share, and gets control to the share
    // after the declared timeout. Then it can close the share and return funds back.
    // The unlocked share doesn't participate in the contract even not yet closed.
    //

    // OfferDefinition of the contract, immutable after the contract is approved
    OfferDefinition private _definition;

    function definition() external view returns(OfferDefinition memory) {
        return _definition;
    }

    // Dynamic contract state
    using EnumerableMap for EnumerableMap.UintToAddressMap;
    using EnumerableSet for EnumerableSet.AddressSet;
    EnumerableSet.AddressSet private _shareholders;                 // shareholders set
    mapping(address => uint) private _shareholder_voting;           // shareholder account -> voting for address or failure
    mapping(address => uint) private _shareholder_share;            // share amount of the shareholder
    mapping(address => uint) private _shareholder_cancelled_at;     // share cancellation timeout
    EnumerableSet.AddressSet private _observers;                    // observers set
    mapping(address => uint) private _observer_voting;              // observer account -> voting for arress or failure

    using ArrayMap for Map;

    // The contract running state
    OfferState public state = OfferState.INITIAL;                 // Current state of the contract

    // When the offer has been approved
    uint public approved_at;

    // When the offer has been completed
    uint public completed_at;

    // When the offer has been failed
    uint public failed_at;

    // The winner who received the money
    address payable public winner;

    function is_finished() internal view returns (bool) {
        // The contract is finished when completed or failed
        return (
            state == OfferState.COMPLETED ||
            state == OfferState.FAILED
        );
    }

    // Errors to revert when the state is wrong to call
    error StartedOnly();
    error PreparedOnly();
    error RunningOnly();
    error OfferBalanceLow();
    error OfferCountLow();

    // Metastate check modifiers
    modifier started_only() {
        if( is_finished() )
            revert StartedOnly();
        _;
    }

    modifier not_completed_only() {
        if( state == OfferState.COMPLETED )
            revert StartedOnly();
        _;
    }

    modifier prepared_only() {
        if( state != OfferState.INITIAL )
            revert PreparedOnly();
        _;
    }

    modifier running_only() {
        if( state != OfferState.APPROVED )
            revert RunningOnly();
        _;
    }

    modifier voting_started() {
        if( address(this).balance < _definition.voting_start_balance )
            revert OfferBalanceLow();
        if( _shareholders.length() < _definition.voting_start_count )
            revert OfferCountLow();
        _;
    }

    // Constructor
    constructor(OfferDefinition memory offer_definition) sender_origin() {
        _definition = offer_definition;
        state = OfferState.INITIAL;
    }

    // Updating functions

    // the event emitted by the create_share method when creating a new share
    event CreateShare (address payable shareholder);

    // the event emitted by the create_share method when adding funds, and contains the total share
    event UpdatedShare (address payable shareholder, uint amount);

    // the event emitted by the cancel_share method when cancelling the share
    event CancelShare (address payable shareholder);

    // the event emitted by the create_observer method
    event CreateObserver (address payable observer);

    // the event emitted by the approve method when the offer has approved
    event OfferApproved ();

    // the event emitted by the calculate_voting when the offer has completed
    event OfferCompleted (address payable winner, uint amount);

    // the event emitted by different update methods when the offer has failed
    event OfferFailed ();

    // Manual state manipulation

    // Update definition on the initial state
    function definition_update(OfferDefinition memory offer_definition) external prepared_only() owner_only() {
        _definition = offer_definition;
    }

    // Approve contract and make it self-controlled
    function approve() external prepared_only() owner_only() {
        // starts the contract evaluation. It blocks any changes
        // in the contract, except adding or cancelling shares
        // Observers list is fixed and can not be modified since that.
        state = OfferState.APPROVED;
        approved_at = block.timestamp;
        emit OfferApproved();
    }

    // Create a share
    //
    // The share is created or updated with a transfer to the offer,
    // except when the offer is finished, or the amount is too low.
    //
    // Creating a share is available for anybody who would like to became a shareholder
    //
    // You should call this method with an amount to be transferred as your share.
    // Send the minimal share amount when creating a share.You also will increace
    // share amount every time sending any amount using this function after that.
    //
    // The amount sent will be immediately transferred to the offer account, and your
    // own share is stored in a separate data member.
    //
    // Cancelling your share is available and needs a special procedure.
    // See share_cancel() and share_revert_share(). Reverting share will move
    // the whole share amount back to the shareholder's account. It's available
    // only for the not completed offer.
    //
    // Use Ethers JS syntax like
    // ```
    // var txs = await shareholder_access.share_create({value: 30000000000000001n});
    // var txs_receipt = await txs.wait();
    // ```
    function share_create() external payable sender_origin() {
        if( is_finished() )
            revert StartedOnly();
        bool got = _shareholders.contains(tx.origin);
        if( !got ) {
            if( msg.value < _definition.share_min_balance )
                revert TooLowShareBalance();
            _shareholders.add(tx.origin);
            emit CreateShare(payable(tx.origin));
        }
        _shareholder_share[tx.origin] += msg.value;
        emit UpdatedShare(payable(tx.origin), _shareholder_share[tx.origin]);
    }

    // Returns share amount for the caller (tx.origin == msg.sender)
    function share_get_for_origin() external view sender_origin() returns(uint) {
        return _shareholder_share[tx.origin];
    }

    // Create an observer
    //
    // Only Offer original author can add observers on the initial stage
    // while the contract has not been started.
    // The `observer_account` is an observers' address who is allowed to
    // vote as an observer.
    function observer_create(address payable observer_account) external prepared_only() owner_only() returns (address payable) {
        if( !_observers.contains(address(observer_account)) ) {
            _observers.add(address(observer_account));
            emit CreateObserver(observer_account);
        }
        return observer_account;
    }

    // Remove the observer
    //
    // The only owner can remove the observer on the initial stage
    // while the contract has not been started.
    // The `observer_account` is an observers' address who is removed
    function observer_remove(address payable observer_account) external prepared_only() owner_only() {
        _observers.remove(address(observer_account));
    }

    // Calculate Voting
    //
    // This complex call can be called by anybody to
    // calculate offer's state. It counts votings and
    // updates the contract state, if the offer definition
    // parameters describing the contract success or failure
    // are met.
    function calculate_voting() external started_only() {

        if( block.timestamp > approved_at + _definition.voting_fail_timeout ) {
            state = OfferState.FAILED;
            failed_at = block.timestamp;
            emit OfferFailed();
            return;
        }

        if( block.timestamp > approved_at + _definition.voting_start_timeout ) {
            uint shares_count = _shareholders.length();
            uint balance = address(this).balance;
            if( shares_count < _definition.voting_start_count ) {
                state = OfferState.FAILED;
                failed_at = block.timestamp;
                emit OfferFailed();
                return;
            }
            if( balance < _definition.voting_start_balance  ) {
                state = OfferState.FAILED;
                failed_at = block.timestamp;
                emit OfferFailed();
                return;
            }
        }

        // Counters
        uint256 winner_shares = get_winner_shares();
        uint256 winner_observers = get_winner_observers();
        if(
            winner_shares == 0 || winner_observers == 0
        ) {
            return;
        }

        uint256 winner_amount_shares = get_winner_amount_shares();
        if( winner_amount_shares == 0 ) {
            return;
        }
        uint256 winner_local = 0;
        if( winner_observers == winner_shares ) {
            state = OfferState.COMPLETED;
            completed_at = block.timestamp;
            winner_local = winner_observers;
        } else if( winner_observers == winner_amount_shares ) {
            state = OfferState.COMPLETED;
            completed_at = block.timestamp;
            winner_local = winner_observers;
        } else {
            // TODO: can ve resolve it using some other way?
            revert VotingConflict();
        }
        if( winner_local == CONTRACT_FAILED ) {
            state = OfferState.FAILED;
            failed_at = block.timestamp;
            emit OfferFailed();
            return;
        }
        winner = payable(address(uint160(winner_local)));
        // Award the winner by the whole collected amount
        winner.transfer(address(this).balance);
        emit OfferCompleted(winner, address(this).balance);
    }

    // Returns (uint) winner by share count, or CONTRACT_FAILED
    function get_winner_shares() internal view returns (uint256) {
        // Total shares count for the list iteration
        uint shares_count = _shareholders.length();
        // Map to store contractor counters
        Map memory contractors_map = ArrayMap.empty();
        // Count of shares voted for contract fail
        uint failed_count = 0;
        // Actual shares count minus those which are in cancelling state
        uint shares_actual_count = 0;
        // Collecting contractor address -> voted count
        for(uint i=0; i < shares_count; i += 1) {
            address shareholder = _shareholders.at(i);
            if( _shareholder_cancelled_at[shareholder] != 0 )
                continue;
            shares_actual_count += 1;
            uint256 voting = _shareholder_voting[shareholder];
            if( voting == CONTRACT_FAILED ) {
                failed_count += 1;
                continue;
            }
            address payable voted = payable(address(uint160(voting)));
            if( voted != payable(address(0)) ) {
                uint cnt = 0;
                bytes memory key = abi.encode(address(voted));
                if( contractors_map.contains(key) ) {
                    cnt = abi.decode(contractors_map.get(key), (uint));
                }
                contractors_map.set(key, abi.encode(cnt + 1));
            }
        }

        // Voting winner
        address payable winner_shares;
        // Winner's share
        uint winner_shares_share;
        (bytes[] memory winners, bytes[] memory counts) = contractors_map.entries();
        for(uint i=0; i < winners.length; i += 1) {
            uint voted_shares = abi.decode(counts[i], (uint));
            uint voted_shares_share = voted_shares * 10000 / shares_actual_count;
            if( voted_shares_share >= _definition.shareholders_vote_share ) {
                if(
                    winner_shares == payable(address(0)) ||
                    winner_shares_share < voted_shares_share  // Will we ignore rare case when they are equal?
                ) {
                    winner_shares = payable(abi.decode(winners[i], (address)));
                    winner_shares_share = voted_shares_share;
                }
            }
        }
        failed_count = failed_count * 10000 / shares_actual_count;  // now it's a failed share
        if( failed_count > winner_shares_share && failed_count >= _definition.shareholders_vote_share )
            return CONTRACT_FAILED;
        return uint256(uint160(address(winner_shares)));
    }

    // Returns (uint) winner by share amount, or CONTRACT_FAILED
    function get_winner_amount_shares() internal view returns (uint256) {
        // Total shares count for the list iteration
        uint shares_count = _shareholders.length();
        // Map to store contractor counters
        Map memory contractors_map = ArrayMap.empty();
        // Count of shares voted for contract fail
        uint failed_amount = 0;
        // Actual shares amount, minus those which are in cancelling state
        uint shares_amount = 0;
        for(uint i=0; i < shares_count; i += 1) {
            address shareholder = _shareholders.at(i);
            if( _shareholder_cancelled_at[shareholder] != 0 )
                continue;
            shares_amount += _shareholder_share[shareholder];
        }

        // Collecting contractor address -> voted count
        for(uint i=0; i < shares_count; i += 1) {
            address shareholder = _shareholders.at(i);
            if( _shareholder_cancelled_at[shareholder] != 0 )
                continue;
            uint256 voting = _shareholder_voting[shareholder];
            uint share = _shareholder_share[shareholder];
            if( voting == CONTRACT_FAILED ) {
                failed_amount += share;
                continue;
            }
            address payable voted = payable(address(uint160(voting)));
            if( voted != payable(address(0)) ) {
                uint amt = 0;
                bytes memory key = abi.encode(address(voted));
                if( contractors_map.contains(key) ) {
                    amt = abi.decode(contractors_map.get(key), (uint));
                }
                contractors_map.set(key, abi.encode(amt + share));
            }
        }

        // Voting winner
        address payable winner_shares;
        // Winner's share
        uint winner_shares_share;
        (bytes[] memory winners, bytes[] memory amounts) = contractors_map.entries();
        for(uint i=0; i < winners.length; i += 1) {
            uint voted_shares = abi.decode(amounts[i], (uint));
            uint voted_shares_share = voted_shares * 10000 / shares_amount;
            if( voted_shares_share >= _definition.shareholders_vote_amount_share ) {
                if(
                    winner_shares == payable(address(0)) ||
                    winner_shares_share < voted_shares_share  // Will we ignore rare case when they are equal?
                ) {
                    winner_shares = payable(abi.decode(winners[i], (address)));
                    winner_shares_share = voted_shares_share;
                }
            }
        }
        failed_amount = failed_amount * 10000 / shares_amount;  // now it's a failed share
        if( failed_amount > winner_shares_share && failed_amount >= _definition.shareholders_vote_amount_share )
            return CONTRACT_FAILED;
        return uint256(uint160(address(winner_shares)));
    }

    // Returns (uint) winner by observers, or CONTRACT_FAILED
    function get_winner_observers() internal view returns (uint256) {
        // number of all observers
        uint observers_count = _observers.length();
        // Map to store contractor counters
        Map memory contractors_map = ArrayMap.empty();
        // Count of observers voted for contract fail
        uint failed_count = 0;

        // Collecting contractor address -> voted count
        for(uint i=0; i < observers_count; i += 1) {
            uint256 voting = _observer_voting[_observers.at(i)];
            if( voting == CONTRACT_FAILED ) {
                failed_count += 1;
                continue;
            }
            address voted = address(uint160(voting));
            if( voted != address(0) ) {
                uint cnt = 0;
                bytes memory key = abi.encode(address(voted));
                if( contractors_map.contains(key) ) {
                    cnt = abi.decode(contractors_map.get(key), (uint));
                }
                contractors_map.set(key, abi.encode(cnt + 1));
            }
        }

        // Voting winner
        address payable winner_observers;
        // Winner's share
        uint winner_observers_share;
        (bytes[] memory winners, bytes[] memory counts) = contractors_map.entries();
        for(uint i=0; i < winners.length; i += 1) {
            uint voted_observers = abi.decode(counts[i], (uint));
            uint voted_observers_share = voted_observers * 10000 / observers_count;
            if( voted_observers_share >= _definition.observers_vote_share ) {
                if(
                    winner_observers == payable(address(0)) ||
                    winner_observers_share < voted_observers_share  // Will we ignore rare case when they are equal?
                ) {
                    winner_observers = payable(abi.decode(winners[i], (address)));
                    winner_observers_share = voted_observers_share;
                }
            }
        }
        failed_count = failed_count * 10000 / observers_count;  // now it's a failed share
        if( failed_count > winner_observers_share && failed_count >= _definition.observers_vote_share )
            return CONTRACT_FAILED;
        return uint256(uint160(address(winner_observers)));
    }

    // Returns a time differense when the share fill finish cancelling timeout
    // and can be really cancelled after the first cancel request
    //
    // Returns timeout left for cancel to be finished.
    // When the timeout has expired, returns 0
    //
    // If the share was not cancelled, returns share_unlock_timeout
    function share_can_be_canceled(address payable shareholder) public view not_completed_only() returns (uint timeout) {
        if( !_shareholders.contains(address(shareholder)) )
            revert WrongParameter();
        uint cancelled_at = _shareholder_cancelled_at[address(shareholder)];
        if( cancelled_at == 0 ) {
            return _definition.share_unlock_timeout;
        }
        if( cancelled_at + _definition.share_unlock_timeout > block.timestamp ) {
            return cancelled_at + _definition.share_unlock_timeout - block.timestamp;
        }
        return 0;
    }
    
    // The only way to cancel the share
    //
    // If it was not yet called, and contract has not been
    // completed successfully, starts the waiting period.
    // 
    // If the waiting period is expired while the contract has not been completed,
    // or if the contract is failed, makes the payment back to the shareholder's account
    // and removes the share from the list of shareholders
    function share_cancel() external not_completed_only() sender_origin() {
        if( !_shareholders.contains(tx.origin) ) {
            revert OwnerOnly();
        }
        if( state != OfferState.FAILED ) {
            uint cancelled_at = _shareholder_cancelled_at[tx.origin];
            if( cancelled_at == 0 ) {
                _shareholder_cancelled_at[tx.origin] = block.timestamp;
            }
            if( cancelled_at + _definition.share_unlock_timeout > block.timestamp ) {
                return;
            }
//         } else {
//             _shareholder_cancelled_at[tx.origin] = block.timestamp;
        }
        payable(tx.origin).transfer(_shareholder_share[tx.origin]);
        _shareholders.remove(tx.origin);
        _shareholder_share[tx.origin] = 0;
        _shareholder_voting[tx.origin] = 0;
        _shareholder_cancelled_at[tx.origin] = 0;
        emit CancelShare(payable(tx.origin));
    }

    // Votings

    // Shareholder voting.
    // Send the address, or fail = True to vote for the contract failure
    //
    // The only shareholder can call this method
    function share_vote(address payable voted_, bool fail) external started_only() voting_started() sender_origin() {
        if( !_shareholders.contains(tx.origin) ) {
            revert OwnerOnly();
        }
        _shareholder_voting[address(tx.origin)] = fail? CONTRACT_FAILED : uint256(uint160(address(voted_)));
    }

    // Observer voting.
    // Send the address, or fail = True to vote for the contract failure
    //
    // The only observer can call this method
    function observer_vote(address payable voted_, bool fail) external started_only() voting_started() sender_origin() {
        if( !_observers.contains(address(tx.origin)) ) {
            revert OwnerOnly();
        }
        _observer_voting[address(tx.origin)] = fail? CONTRACT_FAILED : uint256(uint160(address(voted_)));
    }
}
