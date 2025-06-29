# Offer Definition Data Structure

The `OfferDefinition` data structure defines the parameters of an Offer and is used in the Offer contract constructor. These parameters remain **immutable** for the entire lifecycle of the Offer after approval. The creator of the Offer can modify this structure **freely** until the Offer is approved.  

All the parameters described below are available in the Offer creation and modification UI.

---

## 📌 Offer Description

### 🏷️ Caption
The `caption` attribute is a **short, free-form plain text** field. It provides a brief human-readable identifier for the Offer, helping users distinguish it from other Offers.

### 📖 Description
The `description` attribute is a **detailed, informal description** of the Offer.  
- It supports **Markdown formatting**.  
- It appears **directly below** the `caption` in the Offer details view.

### 📜 Full Details
The `full_details` attribute provides a **formal, structured description** of the problem that the contender must solve.  
- It supports **Markdown formatting**.  
- It is displayed as a **separate full-page view** in the UI, allowing users to scroll through the complete details.

---

## 🔹 Contributor Limitations

### 💰 Contribution Minimal Balance
The `contribution_min_balance` attribute defines the **minimum contribution amount** in ${Wei}=10^{-18}Ξ$.  
- A contributor’s **initial contribution** must meet or exceed this amount.  
- The **total balance** of a contributor must always remain at or above this threshold.

### ⏳ Contribution Unlock Timeout
The `contribution_unlock_timeout` attribute defines the **unlock timeout** (in seconds) for contribution refunds.

Contributors can request a **refund**, but the process occurs in **two steps**:  
1. **Initial request** – Marks the contributor for refund processing and starts the [unlock timeout](OfferDefinition.md#-contribution-unlock-timeout). Voting rights are suspended until the contributor reclaims the contribution.
2. **Final request** – After the timeout expires, the contributor may reclaim all of their contributions in a single transaction.

---

## ✅ Voting Start Conditions

Voting on a contender **only takes effect** once the impact fund reaches predefined thresholds. The following parameters define these thresholds.

### 💰 Voting Start Balance
The `voting_start_balance` attribute sets the **minimum amount** (in ${Wei}=10^{-18}Ξ$) that must be collected in the impact fund **before** voting can take effect.

### 👥 Voting Start Count
The `voting_start_count` attribute defines the **minimum number of contributors** required for voting to take effect.

---

## 🔻 Failure Timeouts

If an Offer's impact fund **fails to meet the thresholds** within the specified time limits (starting from approval time), the Offer is considered **failed**. After failure, **all contributors can immediately reclaim their funds**.

### ⏳ Voting Start Timeout
The `voting_start_timeout` attribute defines the **time limit** (in seconds) within which voting must become active.  
If the threshold is not met within this period, the Offer fails.

### 🔚 Voting Fail Timeout
The `voting_fail_timeout` attribute defines the **maximum duration** (in seconds) for completing voting on a contender.  
If the timeout expires without a successful vote, the Offer is considered **failed**.  
This parameter effectively determines the **maximum lifespan** of the Offer after approval.

---

## 🏆 Voting Success Criteria

The following attributes define **thresholds** that determine when voting is considered successful.  
These thresholds are expressed as **unsigned integers**, in units of $0.01\%$ (from $0=0\%$ to $10000=100\%$).

### 👁️‍🗨️ Observers Vote Percent
The `observers_vote_percent` attribute defines the **percentage of observers** required to vote for a contender in order for them to win.

### 👥 Contributors Vote Percent
The `contributors_vote_percent` attribute defines the **percentage of contributors** required to vote for a contender in order for them to win.

### 💰 Contributors Vote Fund Percent
The `contributors_vote_fund_percent` attribute defines the **percentage of total contribution funds** that must support a contender for them to win.

### ✅ Successful Voting Criteria
Voting is considered **successful** only if the contender selected by **observers (`observers_vote_percent`)** matches at least one contender selected by contributors:  
- **By count** (`contributors_vote_percent`) or  
- **By total funds contributed** (`contributors_vote_fund_percent`).

---

## ❌ Voting for Offer Failure

Contributors and observers **can vote** for a special "contender" that signifies Offer failure.  
If this "failure contender" wins the vote, the Offer is considered **failed**.  
Voting rules for Offer failure follow the **same logic** as voting for any other contender.
