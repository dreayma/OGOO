/// SPDX-License-Identifier: LGPL3

// Open Group's Open Offer
//
// It is a contract for which the both contract sides are open.
// Anybody can become a shareholder to pay reward.
// Anybody can complete the contract and get the reward.

pragma solidity ^0.8.20;

import { ArrayMap, Map } from "solidity-dynamic-array/contracts/ArrayMap.sol";
import { EnumerableMap } from "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";

error WrongSender(); // Protocol broken, this function should be called only from inside another contract
error WrongState(); // The function should not be called in this state of the contract
error WrongParameter(); // The function should not be called with this parameter
error TooLowShareBalance(); // Creating share with the balance less than provided is forbidden
error VotingConflict(); // Happens when the observers voting conflichs with the both, share count and share amount votings

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
}

abstract contract HasOffer {
    // If a contract HasOffer it accepts an `offer` parameter in the
    // constructor and sets up it's attribute to this value

    // This attribute relates to the offer to which the instance belongs
    Offer public offer;

    constructor(Offer offer_) {
        offer = offer_;
    }
}

abstract contract CanVoteForContractor is HasOwner, HasOffer {
    // If a contract CanVoteForContractor, it is HasOffer.
    // Additionally, it can vote for any Contractor of the offer.

    // Voted Contractor
    Contractor public voted;

    constructor(Offer offer_) HasOffer(offer_) {
    }
}

struct OfferDefinition {
    // Definition of the offer, parameter details
    string caption;                         // Short one-line caption of the offer
    string description;                     // Longer multiline unformal text description of the offer supporting `.md` format
    string full_details;                    // All legal details of the contract to print as a document, supporting `.md` format
    uint16 share_unlock_timeout;            // Timeout to unlock an individual share to return to the shareholder, in days
    uint observer_award;                    // Award amount (if present) for each observer in wei

    uint share_min_balance;                 // Minimal share balance to allow voting
    // Vote share is calculated in percents 1 = 0.01%, available values are from 0 = 0% to 10000 = 100%
    // While comparison, the real share is always rounded down to the `floor`: 1.009% ~= 1%, 1.019% ~= 1.01%
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

contract Offer is HasOwner {
    // Offer is a central part of the contract.
    //
    // The offer owner creates the offer, and sets up it's definition.
    // The offer owner adds independent observers while the contract is not yet agreed.
    // The offer owner agrees the contract. After that, the owner can not control the offer.
    // Only shareholders and observers are controlling the contract, instead of the owner,
    // after it has been agreed.
    //
    // People become shareholdes creating a share, appearing to be members of the
    // offer supporter's community. When creating a share, the shareholder agrees
    // with the offer and contract.
    //
    // Potential contractors create Contractor to complete the contract.
    // Creating Contractor, the contractor agrees with the offer and contract.
    // Many contractors may create Contractor to complete the contract, but the only one
    // will get reward when the contract is completed.
    //
    // Shareholders and observers decide, whether the contract is completed and by whom,
    // or failed, or running yet.
    //
    // If the contract is completed, all collected shares move their funds automatically
    // to the contractor, who complete the contract.
    //
    // Failed contract unlocks shares and their owners can return funds back.
    //
    // If the observer's award is not zero, their awards are moved to the observer's contracts
    // when the contract is finished (completed or failed), compensating proportionally
    // from shares funds.
    //
    // The shareholder may request unlocking it's share, and gets control to the share
    // after the declared timeout. Then it can close the share and return funds back.
    // The unlocked share doesn't participate in the contract even not yet closed.
    //
    // If all the shares are unlocked after not less than one was created, the offer
    // is failed.

    // OfferDefinition of the contract, immutable after the contract is approved
    OfferDefinition private _definition;

    function definition() external view returns(OfferDefinition memory) {
        return _definition;
    }

    // Dynamic contract state
    using EnumerableMap for EnumerableMap.UintToAddressMap;
    EnumerableMap.UintToAddressMap private share_owners;            // share owner -> share instance
    EnumerableMap.UintToAddressMap private contractor_owners;       // contractor owner -> contractor instance
    EnumerableMap.UintToAddressMap private observer_accounts;       // observer account -> observer instance

    using ArrayMap for Map;

    // The contract running state
    OfferState public state = OfferState.INITIAL;                 // Current state of the contract

    constructor(OfferDefinition memory offer_definition) {
        _definition = offer_definition;
        state = OfferState.INITIAL;
    }

    // Metastate request functions

    function is_finished() internal view returns (bool) {
        // The contract is finished when completed or failed
        return (
            state == OfferState.COMPLETED ||
            state == OfferState.FAILED
        );
    }

    error StartedOnly();
    error FinishedOnly();
    error PreparedOnly();
    error RunningOnly();
    // Metastate check modifiers
    modifier started_only() {
        if( is_finished() )
            revert StartedOnly();
        _;
    }

    modifier finished_only() {
        if( !is_finished() )
            revert FinishedOnly();
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

    // Updating functions

    // the event emitted by the create_share method
    event CreateShare (Share share);

    // the event emitted by the create_contractor method
    event CreateContractor (Contractor contractor);

    // the event emitted by the create_observer method
    event CreateObserver (Observer observer);

    // Add members - can be called only from the context of member contracts
    //

    function create_share() external payable started_only() returns (Share) {
        // Creating a Share is available for anybody who would like to became a shareholder
        // See the Share contract for details.
        //i
        // You should immediately send the minimal share amount calling this function,
        // to create a share, using syntax like
        // ```
        // share = offer.create_share{value: amount}();
        // ```
        // The amount sent will be immediately transferred to the just created share account
        // Your account will be assigned as an owner of the share account.
        //
        // You can increase your share later. Removing the share is a special procedure.
        // See Share.cancel() and Share.revert_share().
        //

        (bool got, address share_address) = share_owners.tryGet(uint256(uint160(tx.origin)));
        if( !got ) {
            if( msg.value < _definition.share_min_balance )
                revert TooLowShareBalance();
            share_address = address(new Share(this));
            share_owners.set(uint256(uint160(tx.origin)), share_address);
            emit CreateShare(Share(payable(share_address)));
        }
        payable(share_address).transfer(msg.value);
        return Share(payable(share_address));
    }

    function get_share_for_origin() external view returns(Share) {
        // Returns share whose owner is tx.origin
        return Share(payable(share_owners.get(uint256(uint160(tx.origin)))));
    }

    function create_contractor() external started_only() returns (Contractor) {
        // Creating an Contractor is available for anybody who would like to became a contractor
        // See the Contractor instance for details
        (bool got, address contractor_address) = contractor_owners.tryGet(uint256(uint160(tx.origin)));
        if( !got ) {
            contractor_address = address(new Contractor(this));
            contractor_owners.set(uint256(uint160(tx.origin)), contractor_address);
            emit CreateContractor(Contractor(payable(contractor_address)));
        }
        return Contractor(payable(contractor_address));
    }

    function get_contractor_for_origin() external view returns(Contractor) {
        // Returns contractor whose owner is tx.origin
        return Contractor(payable(contractor_owners.get(uint256(uint160(tx.origin)))));
    }

    function create_observer(address payable observer_account) external prepared_only() owner_only() returns (Observer) {
        // Creating an Observer is available only for the owner of the Offer,
        // while the contrac has not been started.
        // The `observer_account` is an observers' address who is allowed to
        // vote as an observer.
        (bool got, address observer_address) = observer_accounts.tryGet(uint256(uint160(address(observer_account))));
        if( !got ) {
            observer_address = address(new Observer(this, observer_account));
            observer_accounts.set(uint256(uint160(address(observer_account))), observer_address);
            emit CreateObserver(Observer(payable(observer_address)));
        }
        return Observer(payable(observer_address));
    }

    function get_observer_for_address(address observer_address) external view returns(Observer) {
        // Returns observer whose observer_address is tx.origin
        return Observer(payable(observer_accounts.get(uint256(uint160(observer_address)))));
    }

    // Remove members - allowed to be called only from the members' account
    function _remove_share(Share share) external started_only() {
        if( tx.origin != address(share.owner()) )
            revert OwnerOnly();
        if( msg.sender != address(share) )
            revert WrongSender();
        share_owners.remove(uint256(uint160(tx.origin)));
    }
    function _remove_contractor(Contractor contractor) external started_only() {
        if( tx.origin != address(contractor.owner()) )
            revert OwnerOnly();
        if( msg.sender != address(contractor) )
            revert WrongSender();
        contractor_owners.remove(uint256(uint160(tx.origin)));
    }
    function _remove_observer(Observer observer) external prepared_only() {
        address observer_account = address(observer.observer_account());
        if( tx.origin != address(observer.owner()) && tx.origin != observer_account )
            revert OwnerOnly();
        if( msg.sender != address(observer) )
            revert WrongSender();
        observer_accounts.remove(uint256(uint160(observer_account)));
    }

    function approve() external prepared_only() owner_only() {
        // starts the contract evaluation. It blocks any changes
        // in the contract, except adding or cancelling shares, and
        // adding or cancelling contractors. Observers are fixed
        // and can not be removed od added.
        state = OfferState.APPROVED;
    }

    function calculate_voting() external started_only() {
        // Counters
        Contractor winner_shares = get_winner_shares();
        Contractor winner_observers = get_winner_observers();
        if(
            address(winner_shares) == address(0) ||
            address(winner_observers) == address(0)
        ) {
            return;
        }

        Contractor winner_amount_shares = get_winner_amount_shares();
        if( address(winner_amount_shares) == address(0) ) {
            return;
        }
        if( winner_observers == winner_shares || winner_observers == winner_amount_shares ) {
            state = OfferState.COMPLETED;
            // TODO: fix a winner
            return;
        }
        // TODO: can ve resolve it using some other way?
        revert VotingConflict();
    }

    function get_winner_shares() internal view returns (Contractor) {
        // number of all shares
        uint shares_count = share_owners.length();
        // Map to store contractor counters
        Map memory contractors_map = ArrayMap.empty();

        // Collecting contractor address -> voted count
        for(uint i=0; i < shares_count; i += 1) {
            (, address addr) = share_owners.at(i);
            Share share = Share(payable(addr));
            Contractor voted = share.voted();
            if( address(voted) != address(0) ) {
                bytes memory cnts = contractors_map.get(abi.encode(address(voted)));
                uint cnt = 0;
                if( cnts.length > 0 )
                    cnt = abi.decode(cnts, (uint));
                contractors_map.set(abi.encode(address(voted)), abi.encode(cnt + 1));
            }
        }

        Contractor winner_shares;
        uint winner_shares_share;
        (bytes[] memory winners, bytes[] memory counts) = contractors_map.entries();
        for(uint i=0; i < winners.length; i += 1) {
            uint voted_shares = abi.decode(counts[i], (uint));
            uint voted_shares_share = voted_shares * 10000 / shares_count;
            if( voted_shares_share >= _definition.shareholders_vote_share ) {
                if(
                    winner_shares == Contractor(payable(address(0))) ||
                    winner_shares_share < voted_shares_share  // Will we ignore rare case when they are equal?
                ) {
                    winner_shares = Contractor(payable(abi.decode(winners[i], (address))));
                    winner_shares_share = voted_shares_share;
                }
            }
        }
        return winner_shares;
    }

    function get_winner_amount_shares() internal view returns (Contractor) {
        // number of all shares
        uint shares_count = share_owners.length();
        // Map to store contractor counters
        Map memory contractors_map = ArrayMap.empty();
        uint shares_amount;
        for(uint i=0; i < share_owners.length(); i += 1) {
            (, address addr) = share_owners.at(i);
            shares_amount += payable(addr).balance;
        }

        // Collecting contractor address -> voted count
        for(uint i=0; i < shares_count; i += 1) {
            (, address addr) = share_owners.at(i);
            Share share = Share(payable(addr));
            Contractor voted = share.voted();
            if( address(voted) != address(0) ) {
                bytes memory amts = contractors_map.get(abi.encode(address(voted)));
                uint amt = 0;
                if( amts.length > 0 )
                    amt = abi.decode(amts, (uint));
                contractors_map.set(abi.encode(address(voted)), abi.encode(amt + address(share).balance));
            }
        }

        Contractor winner_shares;
        uint winner_shares_share;
        (bytes[] memory winners, bytes[] memory amounts) = contractors_map.entries();
        for(uint i=0; i < winners.length; i += 1) {
            uint voted_shares = abi.decode(amounts[i], (uint));
            uint voted_shares_share = voted_shares * 10000 / shares_amount;
            if( voted_shares_share >= _definition.shareholders_vote_amount_share ) {
                if(
                    winner_shares == Contractor(payable(address(0))) ||
                    winner_shares_share < voted_shares_share  // Will we ignore rare case when they are equal?
                ) {
                    winner_shares = Contractor(payable(abi.decode(winners[i], (address))));
                    winner_shares_share = voted_shares_share;
                }
            }
        }
        return winner_shares;
    }

    function get_winner_observers() internal view returns (Contractor) {
        // number of all observers
        uint observers_count = observer_accounts.length();
        // Map to store contractor counters
        Map memory contractors_map = ArrayMap.empty();

        // Collecting contractor address -> voted count
        for(uint i=0; i < observers_count; i += 1) {
            (, address addr) = observer_accounts.at(i);
            Observer observer = Observer(payable(addr));
            Contractor voted = observer.voted();
            if( address(voted) != address(0) ) {
                bytes memory cnts = contractors_map.get(abi.encode(address(voted)));
                uint cnt = 0;
                if( cnts.length > 0 )
                    cnt = abi.decode(cnts, (uint));
                contractors_map.set(abi.encode(address(voted)), abi.encode(cnt + 1));
            }
        }

        Contractor winner_observers;
        uint winner_observers_share;
        (bytes[] memory winners, bytes[] memory counts) = contractors_map.entries();
        for(uint i=0; i < winners.length; i += 1) {
            uint voted_observers = abi.decode(counts[i], (uint));
            uint voted_observers_share = voted_observers * 10000 / observers_count;
            if( voted_observers_share >= _definition.observers_vote_share ) {
                if(
                    winner_observers == Contractor(payable(address(0))) ||
                    winner_observers_share < voted_observers_share  // Will we ignore rare case when they are equal?
                ) {
                    winner_observers = Contractor(payable(abi.decode(winners[i], (address))));
                    winner_observers_share = voted_observers_share;
                }
            }
        }
        return winner_observers;
    }
}

contract Share is CanVoteForContractor {
    // Share is an individual account of every shareholder among the contract.
    // The shareholder is determined by the transaction origin.
    //
    // Funds on the share are frozen until the contract is completed, or failed.
    //
    // The shareholder may return funds from the share before the contract is completed,
    // after some timeout period determined by the contract.
    //
    // The Share will transfer money to the Contractor account when the contract is successfully completed.

    // Block timestamp when the cancel function has been called for the first time
    uint public cancelled_at;

    constructor(Offer offer_) CanVoteForContractor(offer_) {
        if( msg.sender != address(offer_) )
            revert WrongSender();
    }

    function can_be_canceled() external view returns(uint timeout) {
        // Returns a time differente when it can be really cancelled
        // after the first cancel request
        //
        // Returns timeout left for cancel to be finished.
        // When the timeout has expired, returns 0
        if(address(offer) == address(0))
            return 0;
        OfferDefinition memory definition = offer.definition();
        if( cancelled_at == 0 ) {
            return definition.share_unlock_timeout;
        }
        if( cancelled_at + definition.share_unlock_timeout > block.timestamp ) {
            return cancelled_at + definition.share_unlock_timeout - block.timestamp;
        }
        return 0;
    }

    function is_canceled() external view returns(bool cancelled) {
        return address(offer) == address(0);
    }

    function cancel() external owner_only() {
        // Should be the only way to cancel the share
        //
        // If it was not yet called, starts the waiting period.
        // 
        // If the waiting period is expired, zeroes the offer reference,
        // to make a back payment to the owner's account available.
        //
        // Returns timeout left for cancel to be finished.
        // When the timeout has expired, returns 0
        if(address(offer) == address(0))
            return;
        if( cancelled_at == 0 ) {
            cancelled_at = block.timestamp;
        }
        OfferDefinition memory definition = offer.definition();
        if( cancelled_at + definition.share_unlock_timeout > block.timestamp ) {
            return;
        }
        offer._remove_share(this);
        offer = Offer(address(0));
        return;
    }

    function revert_share() external owner_only() {
        // After the share is cancelled, call this method
        // to revert the share back to the owner's account
        if( address(offer) != address(0) )
            revert WrongState();
        owner.transfer(address(this).balance);
    }

    receive() external payable {
        // emit Received(msg.sender, msg.value);
    }

    function vote(Contractor voted_) external owner_only() {
        if( address(voted_) != address(0) ) {
            if( voted_.offer() != offer )
                revert WrongParameter();
        }
        voted = voted_;
    }
}

contract Contractor is HasOffer, HasOwner {
    // Contractor is an individual account of every contractor candidate.
    //
    // Before getting an award, the contractor subscribes to the offer creating an contractor.
    //
    // When the contract shareholders decide whether the contract is completed, they
    // complete a special voting and set up a particular contractor who complete the contract.
    //
    // After the voting is finished, the most voted contractor's account gets an award.

    constructor(Offer offer_) HasOffer(offer_) {
        if( msg.sender != address(offer_) )
            revert WrongSender();
    }

    function cancel() owner_only() external {
        if( offer != Offer(address(0)) )
            offer._remove_contractor(this);
        offer = Offer(address(0));
    }

    receive() external payable {
        // emit Received(msg.sender, msg.value);
    }
}

contract Observer is CanVoteForContractor {
    // Observer is an individual account which is allowed to vote for the contract state
    // as a Share, but not having own funds. The Observer list is fixed when the
    // contract is approved.
    //
    // The observer may be awarded for voting action to the Observer account.

    error ObserverAccountOnly();

    // The original observer account
    address payable public observer_account;

    constructor(Offer offer_, address payable observer_account_) CanVoteForContractor(offer_) {
        if( msg.sender != address(offer_) )
            revert WrongSender();
        if( tx.origin != address(offer_.owner()) )
            revert OwnerOnly();
        observer_account = observer_account_;
    }

    function cancel() external {
        if( tx.origin != address(owner) && tx.origin != address(observer_account) )
            revert OwnerOnly();
        if( offer != Offer(address(0)) )
            offer._remove_observer(this);
        offer = Offer(address(0));
    }

    function vote(Contractor voted_) external {
        if( tx.origin != address(observer_account) )
            revert ObserverAccountOnly();
        if( address(voted_) != address(0) ) {
            if( voted_.offer() != offer )
                revert WrongParameter();
        }
        voted = voted_;
    }
}
