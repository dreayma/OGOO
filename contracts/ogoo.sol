/// SPDX-License-Identifier: LGPL3

// Open Group's Open Offer
//
// It is a contract for which the both contract sides are open.
// Anybody can become a contributor to pay reward.
// Anybody can complete the contract and get the reward.

pragma solidity ^0.8.20;

import { EnumerableSet } from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "hardhat/console.sol";

abstract contract HasOwner {
    // If a contract is HasOwner, it automatically creates a payable public attribute `owner`
    // equal to the transaction origin, i.e. initiator of the call sequence leading to
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

    // Voting parameters
    uint16 observers_vote_percent;          // Observers vote percent (% of total count) to agree the observer's vote
    uint16 contributors_vote_percent;       // Contributors vote percent (% of total count) to agree the contributor's vote
    uint16 contributors_vote_fund_percent;  // Contributors vote fund percent (% of total amount) to agree the contributor's vote
    // TODO: another option? % of total - quorum to make voting available, and % of voice count/amount to calculate winner
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
    // If the contract is completed, all collected amount is moved to the winner contractor immediately
    //
    // Failed contract unlocks all contributions and their owners can return funds back immediately.
    //
    // If the observer's award is not zero, their awards are moved to the observer's addresses [TODO]
    //
    // The contributor may request canceling it's contribution, and gets control to the contribution
    // after the declared canceling timeout. Then it can cancel the contribution and return funds back.
    // The contribution requested, but not canceled yet, doesn't participate in the contract voting, but
    // still can be paid to the contractor, if the voting has been successfully finished within
    // the contribution cancelation period.

    OfferDefinition private _definition;

    // OfferDefinition of the contract, immutable after the contract is approved
    function definition() external view returns(OfferDefinition memory) {
        return _definition;
    }

    // Dynamic contract state
    using EnumerableSet for EnumerableSet.AddressSet;
    using EnumerableSet for EnumerableSet.UintSet;
    EnumerableSet.AddressSet private _contributors;                 // contributors set
    mapping(address => uint) private _contributor_voting;           // contributor account -> voting for address or failure
    mapping(address => uint) private _contributor_contribution;     // contribution amount for the contributor
    mapping(address => uint) private _contributor_canceled_at;      // contribution cancelation timeout start
    EnumerableSet.AddressSet private _observers;                    // observers set
    mapping(address => uint) private _observer_voting;              // observer account -> voting for arress or failure
    EnumerableSet.UintSet    private _contractors;                  // proposed contractors (or CONTRACT_FAILED) set
    mapping(uint => uint)    private _observer_votes_count;         // count of observer votes for the contractor
    mapping(uint => uint)    private _contributor_votes_count;      // count of contributor votes for the contractor
    mapping(uint => uint)    private _contributor_votes_amount;     // summary amount of contributor votes for the contractor
    uint private _total_observer_votes_count;                       // total count of observer votes
    uint private _total_contributor_votes_count;                    // total count of contributor votes except canceled
    uint private _total_contributor_votes_amount;                   // total amount of contributor votes except canceled
    uint private _total_contributors_count;                         // total count of contributors except canceled
    uint private _total_contributors_fund;                          // total fund of contributors except canceled
    uint private _observers_leader_count;                           // count of observer votes for the leader
    uint private _observers_leader;                                 // observer votes leader
    uint private _contributors_leader_count;                        // count of contributor votes for the leader
    uint private _contributors_leader;                              // contributor votes leader
    uint private _contributors_fund_leader_amount;                  // amount of contributor votes fund for the leader
    uint private _contributors_fund_leader;                         // contributor fund votes leader

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

    function is_voting_started_balance() internal view returns(bool) {
        return address(this).balance >= _definition.voting_start_balance;
    }

    function is_voting_started_count() internal view returns(bool) {
        return _contributors.length() >= _definition.voting_start_count;
    }

    function is_voting_started() internal view returns(bool) {
        return is_voting_started_balance() && is_voting_started_count();
    }

    // Errors to revert when the state is wrong to call
    error WrongState();                 // The function should not be called in this state of the contract
    error WrongParameter();             // The function should not be called with this parameter
    error TooLowContribution();         // Creating contribution with the balance less than provided is forbidden
    error CancelationInProgress();      // Contribute from the account with the cancelation in progress is forbidden
    //TODO: Make visible for client
    error VotingConflict();             // When the observers voting conflichs with the both, contribution count and contribution amount votings
    error StartedOnly();                // When the operation has to be called only in the started state
    error PreparedOnly();               // When the operation has to be called only in the prepared state
    error RunningOnly();                // When the operation has to be called only in the running state
    //TODO: Make visible for client
    error ContributionFundLow();        // The contribution fund is too low to start voting
    //TODO: Make visible for client
    error ContributionsCountLow();      // The contributions count is too low to start voting
    //TODO: Make visible for client
    error NoWinnerContributionsCount(); // The contributions count is too low to determine the winner
    //TODO: Make visible for client
    error NoWinnerContributionsFund();  // The contribution fund is too low to determine the winner
    //TODO: Make visible for client
    error NoWinnerObservers();          // The observers count is too low to determine the winner

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
        //TODO: Make visible for client
        if( !is_voting_started_balance() )
            revert ContributionFundLow();
        if( !is_voting_started_count() )
            revert ContributionsCountLow();
        _;
    }

    modifier contributor_only() {
        if( !_contributors.contains(tx.origin) )
            revert OwnerOnly();
        _;
    }

    modifier observer_only() {
        if( !_observers.contains(msg.sender) )
            revert OwnerOnly();
        _;
    }

    // Updating functions

    // the event emitted when the offer has been created
    event OfferCreated();

    // the event emitted when the offer descriptor has been changes since creation
    event OfferDefinitionUpdated(OfferDefinition offer_definition);

    // the event emitted by the create_observer method
    event ObserverCreated (address payable indexed observer);

    // the event emitted by the remove_observer method
    event ObserverRemoved (address payable indexed observer);

    // the event emitted by the approve method when the offer has approved
    event OfferApproved ();

    // the event emitted by the payment when creating a new contribution
    event ContributionCreated (address payable indexed contributor);

    // the event emitted by the payment when adding funds, and contains the total contribution
    event ContributionUpdated (address payable indexed contributor, uint amount);

    // the event emitted by the cancel_contribution method when the contributor starts cancelation
    event ContributionCancelation (address payable indexed contributor);

    // the event emitted by the cancel_contribution method when the contributor finishes cancelation and the funds are returned back
    event ContributionCanceled (address payable indexed contributor);

    // the event emitted by the calculate_voting when the offer has completed
    event OfferCompleted (address payable winner, uint amount);

    // the event emitted when the contributor votes
    event ContributorVote(address payable indexed contributor, address payable contractor, bool failure);

    // the event emitted when the observer votes
    event ObserverVote(address payable indexed observer, address payable contractor, bool failure);

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
        // in the contract, except adding or canceling contributions
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
    // Cancelation your contribution is available and needs a special procedure with some timeout.
    // It's not possible to contribute from the account when the cancelation is in progress.
    // See contribution_cancel().
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
        uint canceled_at = _contributor_canceled_at[tx.origin];
        if( canceled_at > 0 ) {
            revert CancelationInProgress();
        }
        bool got = _contributors.contains(tx.origin);
        if( !got ) {
            if( msg.value < _definition.contribution_min_balance )
                revert TooLowContribution();
            _contributors.add(tx.origin);
            _total_contributors_count += 1;
            emit ContributionCreated(payable(tx.origin));
        }
        _contributor_contribution[tx.origin] += msg.value;
        _total_contributors_fund += msg.value;
        uint voting_ = _contributor_voting[tx.origin];
        if( voting_ != 0 ) {
            // when the contributor votes, the amount should be
            // added to the _contributor_votes_amount for the contractor,
            // and to other cummulative variables.
            _contributor_votes_amount[voting_] += msg.value;
            _total_contributor_votes_amount += msg.value;
            if( voting_ == _contributors_fund_leader ) {
                _contributors_fund_leader_amount += msg.value;
            } else {
                _pretend_to_win_contributors_amount(voting_);
            }
            if( voting_ == _contributors_leader ) {
                _contributors_leader_count += 1;
            } else {
                _pretend_to_win_contributors(voting_);
            }
            _calculate_voting();
        }
        emit ContributionUpdated(payable(tx.origin), _contributor_contribution[tx.origin]);
    }

    function _pretend_to_win_observers(uint voting_) internal {
        // check whether the voting_ should now win for the observers count
        if( _observer_votes_count[voting_] > _observers_leader_count ) {
            _observers_leader_count = _observer_votes_count[voting_];
            _observers_leader = voting_;
        }
    }

    function _pretend_to_win_contributors(uint voting_) internal {
        // check whether the voting_ should now win for the contributors count
        if( _contributor_votes_count[voting_] > _contributors_leader_count ) {
            _contributors_leader_count = _contributor_votes_count[voting_];
            _contributors_leader = voting_;
        }
    }

    function _pretend_to_win_contributors_amount(uint voting_) internal {
        // check whether the voting_ should now win for the contributors fund amount
        if( _contributor_votes_amount[voting_] > _contributors_fund_leader_amount ) {
            _contributors_fund_leader_amount = _contributor_votes_amount[voting_];
            _contributors_fund_leader = voting_;
        }
    }

    function _reset_leaders() internal {
        // check all contractors again and find leaders
        uint contractors_count = _contractors.length();
        _observers_leader_count = _contributors_leader_count = _contributors_fund_leader_amount =
        _observers_leader = _contributors_leader = _contributors_fund_leader = 0;
        if( contractors_count == 0 ) {
            return;
        }

        for(uint i = 0; i < contractors_count; i += 1) {
            uint contractor = _contractors.at(i);
            _pretend_to_win_observers(contractor);
            _pretend_to_win_contributors(contractor);
            _pretend_to_win_contributors_amount(contractor);
        }
    }

    // Returns contribution amount for the caller (tx.origin == msg.sender)
    function contribution_get_for_origin() external view sender_origin() returns(uint) {
        return _contributor_contribution[tx.origin];
    }

    // Calculate Voting and change the state if necessary
    function _calculate_voting() internal {
        if( state != OfferState.APPROVED ) {
            return;
        }
        if( block.timestamp > approved_at + _definition.voting_fail_timeout ) {
            state = OfferState.FAILED;
            failed_at = block.timestamp;
            emit OfferFailed();
            return;
        }

        console.log(">>> total_observer_votes_count:",_total_observer_votes_count);
        console.log(">>> total_contributor_votes_count:",_total_contributor_votes_count);
        console.log(">>> total_contributor_votes_amount:",_total_contributor_votes_amount);
        console.log(">>> total_contributors_count:",_total_contributors_count);
        console.log(">>> total_contributors_fund:",_total_contributors_fund);
        console.log(">>> observers_leader_count:",_observers_leader_count);
        console.log(">>> observers_leader:",_observers_leader);
        console.log(">>> contributors_leader_count:",_contributors_leader_count);
        console.log(">>> contributors_leader:",_contributors_leader);
        console.log(">>> contributors_fund_leader_amount:",_contributors_fund_leader_amount);
        console.log(">>> contributors_fund_leader:",_contributors_fund_leader);

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
        if( !is_voting_started() )
            return;
        uint256 winner_local = _calculate_winner();

        if( winner_local == CONTRACT_FAILED ) {
            state = OfferState.FAILED;
            failed_at = block.timestamp;
            emit OfferFailed();
            return;
        } else if( winner_local != 0 ) {
            state = OfferState.COMPLETED;
            completed_at = block.timestamp;
            winner = payable(address(uint160(winner_local)));
            // Award the winner by the whole collected amount
            uint amount = address(this).balance;
            winner.transfer(amount);
            emit OfferCompleted(winner, amount);
        }
    }

    // Returns a winner looking to the contract restrictions,
    // or 0 in case of incomplete voting
    function _calculate_winner() internal view returns(uint256) {
        uint contractors_count = _contractors.length();
        if( contractors_count == 0 )
            return 0;

        uint observers_count = _observers.length();

        if( observers_count > 0 && _observers_leader_count * 10000 / observers_count < _definition.observers_vote_percent ) {
            return 0;
        }
        if( _total_contributors_count > 0 && _contributors_leader_count * 10000 / _total_contributors_count < _definition.contributors_vote_percent ) {
            return 0;
        }
        if( _total_contributors_fund > 0 && _contributors_fund_leader_amount * 10000 / _total_contributors_fund < _definition.contributors_vote_fund_percent ) {
            return 0;
        }

        uint256 winner_local = 0;
        if( observers_count > 0 ) {
            if( _observers_leader == _contributors_leader ) {
                winner_local = _observers_leader;
            } else if( _observers_leader == _contributors_fund_leader ) {
                winner_local = _observers_leader;
            } else {
                // TODO: can ve resolve it using some other way?
                return 0;
            }
        } else if( _contributors_fund_leader == _contributors_leader ) {
            winner_local = _contributors_leader;
        } else {
            // TODO: can ve resolve it using some other way?
            return 0;
        }
        return winner_local;
    }

    // Returns a time difference between the current time and
    // the time when the contribution fulfills the canceling timeout
    // and so the cancelation can be really finished
    // using the secondary cancel request
    //
    // When the timeout has expired, returns 0
    //
    // If the contribution has not been canceled, or even has not been made,
    // returns contribution_unlock_timeout
    //
    // The function doesn't take the state of the Offer in account
    function contribution_can_be_canceled(address contributor) public view returns (uint timeout) {
        if( !_contributors.contains(contributor) )
            return _definition.contribution_unlock_timeout;
        uint canceled_at = _contributor_canceled_at[contributor];
        if( canceled_at == 0 ) {
            return _definition.contribution_unlock_timeout;
        }
        if( canceled_at + _definition.contribution_unlock_timeout > block.timestamp ) {
            return canceled_at + _definition.contribution_unlock_timeout - block.timestamp;
        }
        return 0;
    }
    
    // The only way to cancel the contribution
    //
    // If it is called when the Offer status is FAILED, cancels the contribution immediately.
    // If it is called when the Offer status is COMPLETED, throws the error.
    //
    // If it is called for the first time when the Offer has not been completed or failed,
    // starts the cancelation timeout.
    //
    // Secondary call within the timeout does nothing.
    // Secondary call after the cancelation timeout expired, cancels the contribution.
    //
    // Check the Offer state and contribution_can_be_canceled results before the secondary
    // call to avoid extra losses on gaz.
    //
    // As soon as the contribution canceling timeout starts, the contributor voting
    // is excluded from the voting results.
    // 
    // To make the contribution canceled, pays back the whole contribution
    // and removes the contribution from the list of contributions
    function contribution_cancel() external not_completed_only() contributor_only() sender_origin() {
        uint contributor_contribution = _contributor_contribution[tx.origin];
        uint canceled_at = _contributor_canceled_at[tx.origin];
        if( canceled_at == 0 ) {
            // first-time cancelation call

            // initiates a cancelation timeout
            canceled_at = _contributor_canceled_at[tx.origin] = block.timestamp;

            // annihilates voting data of this contributor
            uint voice = _contributor_voting[tx.origin];
            if( voice != 0 ) {
                _contributor_votes_count[voice] -= 1;
                _contributor_votes_amount[voice] -= contributor_contribution;
                _total_contributor_votes_count -= 1;
                _total_contributor_votes_amount -= contributor_contribution;
                _cleanup_contractor(voice);
                _reset_leaders();
            }
            _total_contributors_count -= 1;
            _total_contributors_fund -= contributor_contribution;
            _contributor_voting[tx.origin] = 0;
            emit ContributionCancelation(payable(tx.origin));
            _calculate_voting();
        }
        if( state != OfferState.FAILED ) {
            // non-failed contract forces waiting for the cancelation
            if( canceled_at + _definition.contribution_unlock_timeout > block.timestamp ) {
                return;
            }
        }
        // All data should be zeroed to prevent data phantom and reentrance attack
        _contributors.remove(tx.origin);
        _contributor_contribution[tx.origin] = 0;
        _contributor_canceled_at[tx.origin] = 0;
        payable(tx.origin).transfer(contributor_contribution);
        emit ContributionCanceled(payable(tx.origin));
    }

    // Votings

    // Utilities to vote for
    function _contributor_vote_for(address contributor_, uint voice) internal {
        uint old_voted = _contributor_voting[contributor_];
        uint contribution = _contributor_contribution[contributor_];
        if( old_voted != 0 ) {
            _contributor_votes_count[old_voted] -= 1;
            _contributor_votes_amount[old_voted] -= contribution;
            _cleanup_contractor(old_voted);
        }
        _contributor_voting[contributor_] = voice;
        if( voice != 0 ) {
            _contributor_votes_count[voice] += 1;
            _contributor_votes_amount[voice] += contribution;
            if( old_voted == 0 ) {
                _total_contributor_votes_count += 1;
                _total_contributor_votes_amount += contribution;
            }
            _contractors.add(voice); // TODO: who is able to add contractors?
        }
        if( old_voted != 0 ) {
            _reset_leaders();
        } else {
            if( voice != 0 ) {
                _pretend_to_win_contributors(voice);
                _pretend_to_win_contributors_amount(voice);
            }
        }
        _calculate_voting();
    }

    function _observer_vote_for(address observer_, uint voice) internal {
        uint old_voted = _observer_voting[observer_];
        if( old_voted != 0 ) {
            _observer_votes_count[old_voted] -= 1;
            _cleanup_contractor(old_voted);
        }
        _observer_voting[observer_] = voice;
        if( voice != 0 ) {
            _observer_votes_count[voice] += 1;
            if( old_voted == 0 ) {
                _total_observer_votes_count += 1;
            }
            _contractors.add(voice); // TODO: who is able to add contractors?
        }
        if( old_voted != 0 ) {
            _reset_leaders();
        } else {
            if( voice != 0 ) {
                _pretend_to_win_observers(voice);
            }
        }
        _calculate_voting();
    }

    function _cleanup_contractor(uint voice) internal {
        if(
            _contributor_votes_count[voice] == 0 &&
            _contributor_votes_amount[voice] == 0 &&
            _observer_votes_count[voice] == 0
        ) {
            _contractors.remove(voice);
        }
    }

    // Contributor voting for the contractor's address
    function contributor_vote(address payable voice) external started_only() contributor_only() sender_origin() {
        uint canceled_at = _contributor_canceled_at[address(tx.origin)];
        if( canceled_at != 0 ) {
            revert WrongState();
        }
        _contributor_vote_for(address(tx.origin), uint256(uint160(address(voice))));
        emit ContributorVote(payable(tx.origin), voice, false);
    }
    // Contributor voting for the offer failure
    function contributor_vote_failure() external started_only() contributor_only() sender_origin() {
        uint canceled_at = _contributor_canceled_at[address(tx.origin)];
        if( canceled_at != 0 ) {
            revert WrongState();
        }
        _contributor_vote_for(address(tx.origin), CONTRACT_FAILED);
        emit ContributorVote(payable(tx.origin), payable(address(0)), true);
    }

    // Observer voting for the contractor's address
    function observer_vote(address payable voice) external started_only() observer_only() {
        _observer_vote_for(address(msg.sender), uint256(uint160(address(voice))));
        emit ObserverVote(payable(msg.sender), voice, false);
    }
    // Observer voting for the offer failure
    function observer_vote_failure() external started_only() observer_only() {
        _observer_vote_for(address(msg.sender), CONTRACT_FAILED);
        emit ObserverVote(payable(msg.sender), payable(address(0)), true);
    }
    // Informational functions

    // Checks whether the message sender is an observer
    // TODO: remove?
    function is_origin_observer() external view returns(bool yes) {
        return _observers.contains(msg.sender);
    }
    // Checks whether the transaction origin is a contributor
    // TODO: remove?
    function is_origin_contributor() external view returns(bool yes) {
        return _contributors.contains(tx.origin);
    }
}
