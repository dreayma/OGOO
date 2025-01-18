# Pages

- Application
- Offers
    - Add Offer
    - View Offer
- Shares
    - Add Share
    - Cancel Share
    - Share Vote
- Observing
    - Observer Vote
- Offer Admin
    - New Offer
    - Edit Offer

# Application Page

- Big square/rectangle buttons
    - Offers [subbutton +]
    - My Shares [subbutton +]
    - Observing [subbutton +]
    - Offer Admin [subbutton +]
- Current Wallet selector
- Amount Available on the Current Wallet

# Offers Page

- List of offers - all offers known to you
    - Own [icon] - is the offer owned by the current Wallet
    - Shared [icon] - is the current Wallet a shareholder
    - Observed [icon] - is the current Wallet an observer
    - Status [icon] - new, approved, failed, completed
    - Caption [active link to the View Offer Page]
    - Address [hide/view]
    - Share button [share contract address]
    - Delete button [delete offer from the list]
- Add Offer button [add Offer to the list of known offers]
- Save Archive button [save a list of contract addresses to a file]
- Share Archive [share a list of contract addresses to any program]
- Restore Archive [downoad a list of contract addresses from the file]

The clipboard paste allows adding either one, or a list of contract addresses.

The inter-application sharing drop allows adding either one, or a list of contract addresses.

Added addresses are requested for definitions and other chacteristics.

## Add Offer Page

- input:
    - Offer Address to be added [QR code reader, clipboard paste, etc...]

## View Offer Page

- Current Wallet selector
- Amount Available on the Current Wallet

- Own [icon] - is the offer owned by the current Wallet
- Shared [icon] - is the current Wallet a shareholder
- Observed [icon] - is the current Wallet an observer
- Status [icon] - new, approved, failed, completed
- Caption
- Address
- Description [hide/view]
- Full details [hide/view]
- Total amount
- Shareholders count
- Observers count
- Share button [share contract address]
- Delete button [delete offer from the list]
- Edit button [for own and new]
- Approve button [for own and new]
    - info:
        - Projected GAS amount to Approve
        - Projected Ethers amount to Approve
        - Approximate $$ amount to Approve
- Calculate Voting button [for approved]
    - info:
        - Projected GAS amount to Calculate Voting
        - Projected Ethers amount to Calculate Voting
        - Approximate $$ amount to Calculate Voting

# Shares Page

- List of shares - all shares made to known offers
    - Share Amount [+ subbutton to increase the amount using Add Share Page]
    - Offer Caption [link to View Offer]
    - Offer Address [hide/view]
    - Offer Status [icon]
    - Vote Button
    - Share Cancellation time [if cancellation requested]
    - Cancel [or Request Cancel] Button
- Add share button

## Add Share Page

- Current Wallet selector
- Amount Available on the Current Wallet

- Select Offer [from the list of known, or add a new one]

When the offer selected:

- Current Share Amount [if present]
- Offer Caption [link to View Offer]
- Offer Address [link to View Offer]
- Offer Description [hide/view]
- Offer Full details [hide/view]
- Offer Status [icon]
- Minimal amount [=0 if the current share != 0]
- input: Amount
- Share Button
    - info:
        - Projected GAS amount to Add Share
        - Projected Ethers amount to Add Share
        - Approximate $$ amount to Add Share

## Cancel Share Page

- Amount Available on the Current Wallet

- Current Share Amounr
- Offer Caption [link to View Offer]
- Offer Address [link to View Offer]
- Offer Description [hide/view]
- Offer Full details [hide/view]
- Offer Status [icon]
- Share Cancellation time [if cancellation requested]
- Cancel Button
    - info:
        - Projected GAS amount to Cancel Share
        - Projected Ethers amount to Cancel Share
        - Approximate $$ amount to Cancel Share

## Share Vote Page

- Amount Available on the Current Wallet

- Current Share Amounr
- Offer Caption [link to View Offer]
- Offer Address [link to View Offer]
- Offer Description [hide/view]
- Offer Full details [hide/view]
- Offer Status [icon]
- Current Voting [if present]
- input: Contractor Address [QR code reader, clipboard, etc]
- Vote Button
    - info:
        - Projected GAS amount to Vote
        - Projected Ethers amount to Vote
        - Approximate $$ amount to Vote

# Observation Page

- List of observing Offers
    - Offer Caption [link to View Offer]
    - Offer Address [hide/view]
    - Offer Status [icon]
    - Vote Button

## Observer Vote Page

- Amount Available on the Current Wallet

- Offer Caption [link to View Offer]
- Offer Address [link to View Offer]
- Offer Description [hide/view]
- Offer Full details [hide/view]
- Offer Status [icon]
- Current Voting [if present]
- input: Contractor Address [QR code reader, clipboard, etc]
- Vote Button
    - info:
        - Projected GAS amount to Vote
        - Projected Ethers amount to Vote
        - Approximate $$ amount to Vote

# Offer Admin Page

- Current Wallet selector
- Amount Available on the Current Wallet

- List of offers - all (known) offers owned by the current Wallet
    - Status [icon] - new, approved, failed, completed
    - Caption [active link to the Edit Offer Page, if status is new, or to the View Offer Page]
    - Address [hide/view]
    - Share button [share contract address]
- New Offer button [link to the New Offer Page]

## New Offer Page

- Offer Owner Wallet selector
- Amount Available on the Current Wallet

- input:
    - Caption
    - Description
    - Full details
    - Parameters:
        - share parameters:
            - share min malamce (minimal amount to be shared)
            - share unlock timeout (share cancelling unlock timeout)
        - voting start parameters:
            - voting start balance (minimal total shareholders balance to start voting)
            - voting start count (minimal shareholders count to start voting)
            - voting start timeout (maximal time to reach voting start conditions)
        - finalize voting parameters:
            - observers vote share (minimal count of voted observers in percents to finalize voting)
            - shareholders vote share (minimal count of voted shareholders in percents to finalize voting)
            - shareholders vote amount share (minimal voted shareholders balance in percents to finalize voting)
            - voting fail timeout (maximal time to finalize voting)
- Deploy Button [after deployment, redirects to the Edit Offer page]
    - info:
        - Projected GAS amount for the Offer to be deployed
        - Projected Ether amount for the Offer to be deployed
        - Approximate $$ amount for the Offer to be deployed

## Edit Offer Page

- Amount Available on the Current Wallet

- input:
    - Caption
    - Description
    - Full details
    - Parameters:
        - share parameters:
            - share min malamce (minimal amount to be shared)
            - share unlock timeout (share cancelling unlock timeout)
        - voting start parameters:
            - voting start balance (minimal total shareholders balance to start voting)
            - voting start count (minimal shareholders count to start voting)
            - voting start timeout (maximal time to reach voting start conditions)
        - finalize voting parameters:
            - observers vote share (minimal count of voted observers in percents to finalize voting)
            - shareholders vote share (minimal count of voted shareholders in percents to finalize voting)
            - shareholders vote amount share (minimal voted shareholders balance in percents to finalize voting)
            - voting fail timeout (maximal time to finalize voting)
- Update Button
    - info:
        - Projected GAS amount for the Offer update
        - Projected Ether amount for the Offer update
        - Approximate $$ amount for the Offer update
- Observers list
    - Observer address
    - Delete Observer Button
        - info:
            - Projected GAS amount for the Observer Delete
            - Projected Ether amount for the Observer Delete
            - Approximate $$ amount for the Observer Delete
- input: New Observer Address [QR code reader, clipboard, etc]
- Add New Observer button
    - info:
        - Projected GAS amount for the Observer Add
        - Projected Ether amount for the Observer Add
        - Approximate $$ amount for the Observer Add
