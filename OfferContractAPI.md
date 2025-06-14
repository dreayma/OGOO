# Offer Contract API Reference

This document provides a comprehensive reference for all public API endpoints of the Offer smart contract.

## 🏗️ Offer Definition Structure

```solidity
struct OfferDefinition {
    string caption;
    string description;
    string full_details;
    uint contribution_unlock_timeout;
    uint contribution_min_balance;
    uint voting_start_balance;
    uint voting_start_count;
    uint voting_start_timeout;
    uint voting_fail_timeout;
    uint16 observers_vote_percent;
    uint16 contributors_vote_percent;
    uint16 contributors_vote_fund_percent;
}
```

The [`OfferDefinition`](OfferDefinition.md) structure defines all configurable parameters for an Offer instance. These parameters are used during initialization and remain mutable until the Offer is approved.

## 🔄 Offer State Enum

```solidity
enum OfferState {
    INITIAL,
    APPROVED,
    COMPLETED,
    FAILED
}
```

This enum represents the lifecycle status of an Offer:
- `INITIAL` – Assigned immediately after deployment.
- `APPROVED` – Assigned when the Offer owner confirms the offer; from that moment, all parameters and the observer list become immutable.
- `COMPLETED` – Assigned when a contender is successfully selected and all funds have been transferred.
- `FAILED` – Assigned if any failure condition is triggered.

## 📢 Events

```solidity
event OfferCreated();
event OfferDefinitionUpdated(OfferDefinition offer_definition);
event ObserverCreated(address payable indexed observer);
event ObserverRemoved(address payable indexed observer);
event OfferApproved();
event ContributionCreated(address payable indexed contributor);
event ContributionUpdated(address payable indexed contributor, uint amount);
event ContributionCancelation(address payable indexed contributor);
event ContributionCanceled(address payable indexed contributor);
event OfferCompleted(address payable winner, uint amount);
event ContributorVote(address payable indexed contributor, address payable contender, bool failure);
event ObserverVote(address payable indexed observer, address payable contender, bool failure);
event OfferFailed();
```

- `OfferCreated()` – Emitted when a new Offer is created.
- `OfferDefinitionUpdated(OfferDefinition offer_definition)` – Emitted when the Offer definition is updated.
- `ObserverCreated(address payable indexed observer)` – Emitted when an observer is added.
- `ObserverRemoved(address payable indexed observer)` – Emitted when an observer is removed.
- `OfferApproved()` – Emitted when the Offer is approved by the owner.
- `ContributionCreated(address payable indexed contributor)` – Emitted when a new contributor joins.
- `ContributionUpdated(address payable indexed contributor, uint amount)` – Emitted when an existing contributor increases their contribution; reflects the total contributed amount.
- `ContributionCancelation(address payable indexed contributor)` – Emitted when a contributor initiates a refund request.
- `ContributionCanceled(address payable indexed contributor)` – Emitted when a contributor receives a refund after the unlock timeout expires.
- `OfferCompleted(address payable winner, uint amount)` – Emitted when the Offer is successfully completed and funds are transferred to the contender.
- `ContributorVote(address payable indexed contributor, address payable contender, bool failure)` – Emitted when a contributor casts a vote.
- `ObserverVote(address payable indexed observer, address payable contender, bool failure)` – Emitted when an observer casts a vote.
- `OfferFailed()` – Emitted when the Offer fails.

## 🛡️ Modifiers

Modifiers restrict access to contract methods based on roles and the current Offer state.

```solidity
modifier sender_origin() {...}
modifier owner_only() {...}
modifier contributor_only() {...}
modifier observer_only() {...}
modifier started_only() {...}
modifier not_completed_only() {...}
modifier prepared_only() {...}
modifier running_only() {...}
modifier voting_started() {...}
```

- `sender_origin` – Ensures that the message `sender` matches the transaction `origin`; restricts calls to EOAs (Externally Owned Accounts).
- `owner_only` – Limits method calls strictly to the Offer owner.
- `contributor_only` – Restricts method calls to registered contributors.
- `observer_only` – Restricts method calls to registered observers.
- `started_only` – Requires the Offer to be active (not completed or failed).
- `not_completed_only` – Ensures that the Offer is not in a completed state.
- `prepared_only` – Requires the Offer to be in the `INITIAL` state.
- `running_only` – Requires the Offer to be in the `APPROVED` state.
- `voting_started` – Confirms that voting thresholds have been met.

## 🏗️ Contract Constructor

```solidity
constructor(OfferDefinition memory offer_definition) sender_origin()
```

The constructor initializes a new Offer with the provided [`OfferDefinition`](OfferDefinition.md). Only an EOA can deploy an Offer and becomes its owner. The owner has exclusive rights to update parameters and manage observers until approval. Once the owner calls `approve()`, the Offer transitions to the `APPROVED` state, and all parameters along with the observer list become immutable.

## ✏️ Definition Update Method

```solidity
function definition_update(OfferDefinition memory offer_definition) external prepared_only() owner_only()
```

This method allows the owner to update the Offer parameters while the Offer is in the `INITIAL` state.

## 👁️ Observer Create Method

```solidity
function observer_create(address payable observer_account) external prepared_only() owner_only()
```

This method allows the owner to add an observer while the Offer is in the `INITIAL` state.

## ❌ Observer Remove Method

```solidity
function observer_remove(address payable observer_account) external prepared_only() owner_only()
```

This method allows the owner to remove an observer while the Offer is in the `INITIAL` state.

## ✅ Approve Method

```solidity
function approve() external prepared_only() owner_only()
```

Calling `approve()` transitions the Offer to the `APPROVED` state. After approval, all parameters and the observer list are locked.

## 💸 Receiving Contributions

```solidity
receive() external payable sender_origin()
```

Any EOA can contribute funds. The first contribution from a new contributor must meet the [minimum contribution](OfferDefinition.md#-contribution-minimal-balance) requirement; subsequent contributions may be any amount.

## 🔙 Cancel Contribution

```solidity
function contribution_cancel() external not_completed_only() contributor_only() sender_origin()
```

Contributors can request a refund via a two-step process:
1. **Initial request** – Marks the contributor for refund processing and starts the [unlock timeout](OfferDefinition.md#-contribution-unlock-timeout). Voting rights are suspended until the contributor reclaims the contribution.
2. **Final request** – After the timeout expires, the contributor may reclaim all of their contributions in a single transaction.

## 🗳️ Contributor Voting

```solidity
function contributor_vote(address payable voice) external started_only() contributor_only() sender_origin()
```
```solidity
function contributor_vote_failure() external started_only() contributor_only() sender_origin()
```

Contributors can vote for a contender or indicate Offer failure. Votes may be changed until the Offer is finalized.

## 🗳️ Observer Voting

```solidity
function observer_vote(address payable voice) external started_only() observer_only()
```
```solidity
function observer_vote_failure() external started_only() observer_only()
```

Observers can vote for a contender or indicate Offer failure, with the option to change their vote until the Offer is finalized.

## 📊 Public Variables

Public variables are accessible as view functions that provide real-time Offer state information.

### 👤 Owner

```solidity
address payable public owner
```

The immutable address of the Offer owner, established during contract creation.

### 🔄 State

```solidity
OfferState public state = OfferState.INITIAL
```

The current state of the Offer, initially set to `INITIAL` and transitioning through `APPROVED`, `COMPLETED`, or `FAILED`.

### 🏆 Winner

```solidity
address payable public winner
```

The address of the contender who wins the Offer. This variable is set when the Offer is successfully completed.

### ⏰ Approve Timestamp

```solidity
uint public approved_at
```

The block timestamp when the Offer is approved.

### 🏁 Complete Timestamp

```solidity
uint public completed_at
```

The block timestamp when the Offer is successfully completed and funds are transferred.

### ❗ Failure Timestamp

```solidity
uint public failed_at
```

The block timestamp when the Offer fails.

## ℹ️ Informational Functions

These view functions provide detailed insights into the Offer state and contributor information.

### 💰 Contribution Amount

```solidity
function contribution_get_for_origin() external view sender_origin() returns(uint)
```

Returns the total contribution amount made by the caller.

### ⏳ Unlock Timeout

```solidity
function contribution_can_be_canceled(address contributor) public view returns (uint timeout)
```

Returns the remaining time (in seconds) of the unlock timeout for a contributor. If a cancellation has not been requested, it returns the full unlock timeout duration.

### 👁️‍🗨️ Is Origin an Observer?

```solidity
function is_origin_observer() external view returns(bool yes)
```

Returns `true` if the transaction's origin is a registered observer; otherwise, returns `false`.

### 👥 Is Origin a Contributor?

```solidity
function is_origin_contributor() external view returns(bool yes)
```

Returns `true` if the transaction's origin is a registered contributor; otherwise, returns `false`.
