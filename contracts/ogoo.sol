/// SPDX-License-Identifier: LGPL3

// Open Group's Open Offer
//
// It is a contract for which the both contract sides are open.
// Anybody can become a contributor to pay reward.
// Anybody can complete the contract and get the reward.

pragma solidity ^0.8.20;

import { ArrayMap, Map } from "solidity-dynamic-array/contracts/ArrayMap.sol";
import { EnumerableSet } from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";

abstract contract HasOwner {
    // If a contract is HasOwner, it automatically creates a payable public attribute `owner`
    // equal to the transactuion origin, i.e. initiator of the call sequence leading to
    // the contract instance creation

    error OwnerOnly(); // Only owner allowed to evaluate this operation
    error ProxyForbidden(); // Happens if the ts.origin != msg.sender

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
    //  - percentage value is integer, 1 = 0.01%, 0 = 0%, 10000=100%,
    //    the percentage is always rounded to the lower bound during the calculation:
    //    1.001% ~= 1.00%, 1.009% ~= 1.00%, 1.019% ~= 1.01%

    string caption;                         // Short one-line caption of the offer
    string description;                     // Longer multiline unformal text description of the offer supporting `.md` format
    string full_details;                    // All legal details of the contract to print as a document, supporting `.md` format, may be compressed
    uint contribution_unlock_timeout;       // Timeout to unlock an individual contribution to return to the contributor
    uint observer_award;                    // Award amount (if present) for each observer (TODO:)

    uint contribution_min_balance;          // Minimal contribution balance to make the contribution

    // Offer voting bounds. The offer should exceed minimal voting bounds within voting start timeout to make voting available
    uint voting_start_balance;              // Minimal offer balance to start voting
    uint voting_start_count;                // Minimal number of the offer contributors to start voting
    uint voting_start_timeout;              // The offer should exceed minimal voting bounds after approve within this timeout, or the offer has failed
    uint voting_fail_timeout;               // The offer voting should be completed after approve within this timeout, or the offer has failed

    // Contributor voting parameters
    uint16 observers_vote_percent;          // Observers vote percent (% of total count) to agree the observer's vote
    uint16 contributors_vote_percent;       // Contributors vote percent (% of total count) to agree the contributor's vote
    uint16 contributors_vote_fund_percent;  // Contributors vote fund percent (% of total amount) to agree the contributor's vote
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
    // The contract is paid by the offer contributors community.
    //
    // The offer contributors vote for the particular contractor when the contract conditions
    // are met, or for the contract failure, if the conrtract can not be completed for any reason.
    //
    // The offer can have some number of observers who also vote for the contractor
    // or the contract failure. If observers are present, their voting should match
    // with the contributors' voting to have the contract completed successfully
    //
    // When the offer owner creates the offer, he sets up it's definition,
    // and adds independent observers. The offer owner can change the contract
    // until the contract is agreed by him. After that, no any changes available
    // to the contract parameters, or the list of observers, and only contributors
    // and observers are mutually controlling the contract state.
    //
    // People become contributors by sending their contributions to the contract account,
    // thereby agreeing to the details of the contract.
    //
    // Contributors and observers control the contract state voting for changes.
    //
    // If the contract is completed, all collected amount is moved to the voted contractor immediately
    //
    // Failed contract unlocks all contributions and their owners can return funds back immediately.
    //
    // If the observer's award is not zero, their awards are moved to the observer's addresses [TODO]
    //
    // The contributor may request cancelling it's contribution, and gets control to the contribution
    // after the declared cancelling timeout. Then it can cancel the contribution and return funds back.
    // The contribution requested, but not cancelled yet, doesn't participate in the contract voting, but
    // still can be paid to the contractor, if the voting has been successfully finished within
    // the contribution cancellation period.

    OfferDefinition private _definition;

    // OfferDefinition of the contract, immutable after the contract is approved
    function definition() external view returns(OfferDefinition memory) {
        return _definition;
    }

    // Dynamic contract state
    using EnumerableSet for EnumerableSet.AddressSet;
    EnumerableSet.AddressSet private _contributors;                 // contributors set
    mapping(address => uint) private _contributor_voting;           // contributor account -> voting for address or failure
    mapping(address => uint) private _contributor_contribution;     // contribution amount for the contributor
    mapping(address => uint) private _contributor_cancelled_at;     // contribution cancellation timeout start
    EnumerableSet.AddressSet private _observers;                    // observers set
    mapping(address => uint) private _observer_voting;              // observer account -> voting for arress or failure

    using ArrayMap for Map;

    // The contract running state
    OfferState public state = OfferState.INITIAL;                 // Current state of the contract

    // When the offer has been approved
    uint public approved_at;

    // When the offer has been completedcontributions
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
    error WrongState();                 // The function should not be called in this state of the contract
    error WrongParameter();             // The function should not be called with this parameter
    error TooLowContribution();         // Creating contribution with the balance less than provided is forbidden
    error VotingConflict();             // When the observers voting conflichs with the both, contribution count and contribution amount votings
    error StartedOnly();                // When the operation has to be called only in the started state
    error PreparedOnly();               // When the operation has to be called only in the prepared state
    error RunningOnly();                // When the operation has to be called only in the running state
    error ContributionFundLow();        // The contribution fund is too low to start voting
    error ContributionsCountLow();      // The contributions count is too low to start voting
    error NoWinnerContributionsCount(); // The voted contributions count is too low to determine the winner
    error NoWinnerContributionsFund();  // The voted contribution fund is too low to determine the winner
    error NoWinnerObservers();          // The voted offers count is too low to determine the winner

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
            revert ContributionFundLow();
        if( _contributors.length() < _definition.voting_start_count )
            revert ContributionsCountLow();
        _;
    }

    modifier contributor_only() {
        if( !_contributors.contains(tx.origin) )
            revert OwnerOnly();
        _;
    }

    modifier observer_only() {
        if( !_observers.contains(tx.origin) )
            revert OwnerOnly();
        _;
    }

    // Updating functions

    // the event emitted when the offer has been created
    event OfferCreated();

    // the event emitted when the offer descriptor has been changes since creation
    event OfferDefinitionUpdated(OfferDefinition offer_definition);

    // the event emitted by the create_observer method
    event ObserverCreated (address payable observer);

    // the event emitted by the remove_observer method
    event ObserverRemoved (address payable observer);

    // the event emitted by the approve method when the offer has approved
    event OfferApproved ();

    // the event emitted by the payment when creating a new contribution
    event ContributionCreated (address payable contributor);

    // the event emitted by the payment when adding funds, and contains the total contribution
    event ContributionUpdated (address payable contributor, uint amount);

    // the event emitted by the cancel_contribution method when cancelling the contribution
    event ContributionCanceled (address payable contributor);

    // the event emitted by the calculate_voting when the offer has completed
    event OfferCompleted (address payable winner, uint amount);

    // the event emitted when the contributor votes
    event ContributorVote(address payable contributor, address payable contractor, bool failure);

    // the event emitted when the observer votes
    event ObserverVote(address payable observer, address payable contractor, bool failure);

    // the event emitted by different update methods when the offer has failed
    event OfferFailed ();

    // Constructor
    constructor(OfferDefinition memory offer_definition) sender_origin() {
        _definition = offer_definition;
        state = OfferState.INITIAL;
         emit OfferCreated();
    }

    // Manual state manipulation before approval

    // Update definition on the initial state
    function definition_update(OfferDefinition memory offer_definition) external prepared_only() owner_only() {
        _definition = offer_definition;
        emit OfferDefinitionUpdated(offer_definition);
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
            emit ObserverCreated(observer_account);
        }
        return observer_account;
    }

    // Remove the observer
    //
    // The only owner can remove the observer on the initial stage
    // while the contract has not been started.
    // The `observer_account` is an observers' address who is removed
    function observer_remove(address payable observer_account) external prepared_only() owner_only() {
        if( _observers.contains(address(observer_account)) ) {
            _observers.remove(address(observer_account));
            emit ObserverRemoved(observer_account);
        } else {
            revert WrongParameter();
        }
    }

    // Approve contract and make it self-controlled
    function approve() external prepared_only() owner_only() {
        // starts the contract evaluation. It blocks any changes
        // in the contract, except adding or cancelling contributions
        // Observers list is fixed and can not be modified since that.
        state = OfferState.APPROVED;
        approved_at = block.timestamp;
        emit OfferApproved();
    }

    // Create a contribution
    //
    // The contribution is created or updated with a transfer to the offer,
    // except when the offer is finished, or the amount is too low.
    //
    // Creating a contribution is available for anybody who would like to became a contributor
    //
    // You should transfer to the offer's account with an amount to be your contribution.
    // Send the minimal contribution amount when creating a contribution. You also will increace
    // contribution amount every time sending any amount after that.
    //
    // Your contribution is stored in a separate data member.
    //
    // Cancelling your contribution is available and needs a special procedure.
    // See contribution_cancel(). Reverting contribution will move
    // the whole contribution amount back to the contributor's account. It's available
    // only for the not completed offer.
    //
    // Use Ethers JS syntax like
    // ```
    // var txs = await account_contributor.sendTransaction({to: offer_address, value: 30000000000000001n});
    // var txs_receipt = await txs.wait();
    // ```
    receive() external payable sender_origin() {
        if( is_finished() )
            revert StartedOnly();
        if( tx.origin == address(0) )
            revert WrongParameter();
        bool got = _contributors.contains(tx.origin);
        if( !got ) {
            if( msg.value < _definition.contribution_min_balance )
                revert TooLowContribution();
            _contributors.add(tx.origin);
            emit ContributionCreated(payable(tx.origin));
        }
        _contributor_contribution[tx.origin] += msg.value;
        emit ContributionUpdated(payable(tx.origin), _contributor_contribution[tx.origin]);
    }

    // Returns contribution amount for the caller (tx.origin == msg.sender)
    function contribution_get_for_origin() external view sender_origin() returns(uint) {
        return _contributor_contribution[tx.origin];
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
            uint contributions_count = _contributors.length();
            uint balance = address(this).balance;
            if( contributions_count < _definition.voting_start_count ) {
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
        uint observers_count = _observers.length();
        uint256 winner_contributions = get_winner_contributions();
        if( winner_contributions == 0 ) {
            revert NoWinnerContributionsCount();
        }
        uint256 winner_amount_contributions = get_winner_amount_contributions();
        if( winner_amount_contributions == 0 ) {
            revert NoWinnerContributionsFund();
        }
        uint256 winner_local = 0;
        if( observers_count != 0 ) {
            uint256 winner_observers = get_winner_observers();
            if( winner_observers == 0 ) {
                revert NoWinnerObservers();
            }
            if( winner_observers == winner_contributions ) {
                state = OfferState.COMPLETED;
                completed_at = block.timestamp;
                winner_local = winner_observers;
            } else if( winner_observers == winner_amount_contributions ) {
                state = OfferState.COMPLETED;
                completed_at = block.timestamp;
                winner_local = winner_observers;
            } else {
                // TODO: can ve resolve it using some other way?
                revert VotingConflict();
            }
        } else if( winner_amount_contributions == winner_contributions ) {
            state = OfferState.COMPLETED;
            completed_at = block.timestamp;
            winner_local = winner_contributions;
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
        uint amount = address(this).balance;
        winner.transfer(amount);
        emit OfferCompleted(winner, amount);
    }

    // Returns (uint) winner by contribution count, or CONTRACT_FAILED
    function get_winner_contributions() internal view returns (uint256) {
        // Total contributions count for the list iteration
        uint contributions_count = _contributors.length();
        // Map to store contractor counters
        Map memory contractors_map = ArrayMap.empty();
        // Count of contributions voted for contract fail
        uint failed_count = 0;
        // Actual contributions count minus those which are in cancelling state
        uint contributions_actual_count = 0;
        // Collecting contractor address -> voted count
        for(uint i=0; i < contributions_count; i += 1) {
            address contributor = _contributors.at(i);
            if( _contributor_cancelled_at[contributor] != 0 )
                continue;
            contributions_actual_count += 1;
            uint256 voting = _contributor_voting[contributor];
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

        if( contributions_actual_count == 0 )
            return 0;
        // Voting winner
        address payable winner_contributions;
        // Winner's percent
        uint winner_contributions_percent;
        (bytes[] memory winners, bytes[] memory counts) = contractors_map.entries();
        for(uint i=0; i < winners.length; i += 1) {
            uint voted_contributions = abi.decode(counts[i], (uint));
            uint voted_contributions_percent = voted_contributions * 10000 / contributions_actual_count;
            if( voted_contributions_percent >= _definition.contributors_vote_percent ) {
                if(
                    winner_contributions == payable(address(0)) ||
                    winner_contributions_percent < voted_contributions_percent  // Will we ignore rare case when they are equal?
                ) {
                    winner_contributions = payable(abi.decode(winners[i], (address)));
                    winner_contributions_percent = voted_contributions_percent;
                }
            }
        }
        failed_count = failed_count * 10000 / contributions_actual_count;  // now it's a failed contribution
        if( failed_count > winner_contributions_percent && failed_count >= _definition.contributors_vote_percent )
            return CONTRACT_FAILED;
        return uint256(uint160(address(winner_contributions)));
    }

    // Returns (uint) winner by contribution amount, or CONTRACT_FAILED
    function get_winner_amount_contributions() internal view returns (uint256) {
        // Total contributions count for the list iteration
        uint contributions_count = _contributors.length();
        // Map to store contractor counters
        Map memory contractors_map = ArrayMap.empty();
        // Count of contributions voted for contract fail
        uint failed_amount = 0;
        // Actual contributions amount, minus those which are in cancelling state
        uint contributions_amount = 0;
        for(uint i=0; i < contributions_count; i += 1) {
            address contributor = _contributors.at(i);
            if( _contributor_cancelled_at[contributor] != 0 )
                continue;
            contributions_amount += _contributor_contribution[contributor];
        }

        if( contributions_amount == 0 )
            return 0;

        // Collecting contractor address -> voted count
        for(uint i=0; i < contributions_count; i += 1) {
            address contributor = _contributors.at(i);
            if( _contributor_cancelled_at[contributor] != 0 )
                continue;
            uint256 voting = _contributor_voting[contributor];
            uint contribution = _contributor_contribution[contributor];
            if( voting == CONTRACT_FAILED ) {
                failed_amount += contribution;
                continue;
            }
            address payable voted = payable(address(uint160(voting)));
            if( voted != payable(address(0)) ) {
                uint amt = 0;
                bytes memory key = abi.encode(address(voted));
                if( contractors_map.contains(key) ) {
                    amt = abi.decode(contractors_map.get(key), (uint));
                }
                contractors_map.set(key, abi.encode(amt + contribution));
            }
        }

        // Voting winner
        address payable winner_contributions;
        // Winner's percent
        uint winner_contributions_percent;
        (bytes[] memory winners, bytes[] memory amounts) = contractors_map.entries();
        for(uint i=0; i < winners.length; i += 1) {
            uint voted_contributions = abi.decode(amounts[i], (uint));
            uint voted_contributions_percent = voted_contributions * 10000 / contributions_amount;
            if( voted_contributions_percent >= _definition.contributors_vote_fund_percent ) {
                if(
                    winner_contributions == payable(address(0)) ||
                    winner_contributions_percent < voted_contributions_percent  // Will we ignore rare case when they are equal?
                ) {
                    winner_contributions = payable(abi.decode(winners[i], (address)));
                    winner_contributions_percent = voted_contributions_percent;
                }
            }
        }
        failed_amount = failed_amount * 10000 / contributions_amount;  // now it's a failed contribution
        if( failed_amount > winner_contributions_percent && failed_amount >= _definition.contributors_vote_fund_percent )
            return CONTRACT_FAILED;
        return uint256(uint160(address(winner_contributions)));
    }

    // Returns (uint) winner by observers, or CONTRACT_FAILED
    function get_winner_observers() internal view returns (uint256) {
        // number of all observers
        uint observers_count = _observers.length();
        // Map to store contractor counters
        if( observers_count == 0 )
            return 0;
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
        // Winner's percent
        uint winner_observers_percent;
        (bytes[] memory winners, bytes[] memory counts) = contractors_map.entries();
        for(uint i=0; i < winners.length; i += 1) {
            uint voted_observers = abi.decode(counts[i], (uint));
            uint voted_observers_percent = voted_observers * 10000 / observers_count;
            if( voted_observers_percent >= _definition.observers_vote_percent ) {
                if(
                    winner_observers == payable(address(0)) ||
                    winner_observers_percent < voted_observers_percent  // Will we ignore rare case when they are equal?
                ) {
                    winner_observers = payable(abi.decode(winners[i], (address)));
                    winner_observers_percent = voted_observers_percent;
                }
            }
        }
        failed_count = failed_count * 10000 / observers_count;  // now it's a failed contribution
        if( failed_count > winner_observers_percent && failed_count >= _definition.observers_vote_percent )
            return CONTRACT_FAILED;
        return uint256(uint160(address(winner_observers)));
    }

    // Returns a time differense when the contribution fulfills the cancelling timeout
    // and can be really cancelled using the cancel request
    //
    // Returns timeout left until cancelling can be finished.
    // When the timeout has expired, returns 0
    //
    // If the contribution was not cancelled, returns contribution_unlock_timeout
    function contribution_can_be_canceled(address contributor) public view not_completed_only() returns (uint timeout) {
        if( !_contributors.contains(contributor) )
            revert WrongParameter();
        uint cancelled_at = _contributor_cancelled_at[contributor];
        if( cancelled_at == 0 ) {
            return _definition.contribution_unlock_timeout;
        }
        if( cancelled_at + _definition.contribution_unlock_timeout > block.timestamp ) {
            return cancelled_at + _definition.contribution_unlock_timeout - block.timestamp;
        }
        return 0;
    }
    
    // The only way to cancel the contribution
    //
    // If it was not yet called, and contract has not been
    // completed successfully, starts the waiting period.
    // 
    // If the waiting period is expired while the contract has not been completed,
    // or if the contract is failed, makes the payment back to the contributor's account
    // and removes the contribution from the list of contributors
    function contribution_cancel() external not_completed_only() contributor_only() sender_origin() {
        if( state != OfferState.FAILED ) {
            uint cancelled_at = _contributor_cancelled_at[tx.origin];
            if( cancelled_at == 0 ) {
                cancelled_at = _contributor_cancelled_at[tx.origin] = block.timestamp;
            }
            if( cancelled_at + _definition.contribution_unlock_timeout > block.timestamp ) {
                return;
            }
        }
        uint contributor_contribution = _contributor_contribution[tx.origin];
        // All data should be zeroed to prevent data phantom and reentrance attack
        _contributors.remove(tx.origin);
        _contributor_contribution[tx.origin] = 0;
        _contributor_voting[tx.origin] = 0;
        _contributor_cancelled_at[tx.origin] = 0;
        payable(tx.origin).transfer(contributor_contribution);
        emit ContributionCanceled(payable(tx.origin));
    }

    // Votings

    // Contributor voting for the contractor's address
    function contributor_vote(address payable voted_) external started_only() contributor_only()  voting_started() sender_origin() {
        uint cancelled_at = _contributor_cancelled_at[address(tx.origin)];
        if( cancelled_at != 0 ) {
            revert WrongState();
        }
        _contributor_voting[address(tx.origin)] = uint256(uint160(address(voted_)));
        emit ContributorVote(payable(tx.origin), voted_, false);
    }
    // Contributor voting for the offer failure
    function contributor_vote_failure() external started_only() contributor_only() voting_started() sender_origin() {
        uint cancelled_at = _contributor_cancelled_at[address(tx.origin)];
        if( cancelled_at != 0 ) {
            revert WrongState();
        }
        _contributor_voting[address(tx.origin)] = CONTRACT_FAILED;
        emit ContributorVote(payable(tx.origin), payable(address(0)), true);
    }

    // Observer voting for the contractor's address
    function observer_vote(address payable voted_) external started_only() observer_only() voting_started() sender_origin() {
        _observer_voting[address(tx.origin)] = uint256(uint160(address(voted_)));
        emit ObserverVote(payable(tx.origin), voted_, false);
    }
    // Observer voting for the offer failure
    function observer_vote_failure() external started_only() observer_only() voting_started() sender_origin() {
        _observer_voting[address(tx.origin)] = CONTRACT_FAILED;
        emit ObserverVote(payable(tx.origin), payable(address(0)), true);
    }
    // Informational functions

    // Checks whether the transaction origin is an observer
    function is_origin_observer() external view returns(bool yes) {
        return _observers.contains(tx.origin);
    }

    // Checks whether the transaction origin is a contributor
    function is_origin_contributor() external view returns(bool yes) {
        return _contributors.contains(tx.origin);
    }
}
