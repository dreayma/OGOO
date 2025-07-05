# How to Test the OGOO Software

## Install a Wallet

The OGOO software requires a cryptocurrency wallet. We recommend [MetaMask](https://metamask.io/).

To install the MetaMask extension:

1. Open your web browser (Chrome, Firefox, Edge, or Brave).
2. Visit the [official MetaMask website](https://metamask.io/).
3. Click **Download** and select your browser.
4. Follow the prompts to add the MetaMask extension.
5. After installation, click the MetaMask icon in your browser toolbar to set up your wallet.

## Install a Local Test Cryptocurrency Network

This step is _optional_ if you want to use the software on a public Ethereum testnet or mainnet. Please note that you will **spend your tokens** on whichever network you use for testing.

We recommend starting a local HardHat test node. To do this, you need Node.js installed.

### Install Node.js

Node.js is required to run HardHat. To install Node.js:

1. Visit the [official Node.js website](https://nodejs.org/).
2. Download the **LTS** (Long Term Support) version for your operating system.
3. Run the installer and follow the setup instructions.
4. After installation, verify Node.js is installed by running the following commands in your terminal:

    ```sh
    node --version
    npm --version
    ```

Both commands should print version numbers, confirming a successful installation.

### Install HardHat

HardHat is a development environment for Ethereum smart contracts. To install it:

1. Create an empty folder.
2. Open your terminal in that folder.
3. Run the following command to install HardHat as a development dependency:

    ```sh
    npm install hardhat
    ```

4. After installation, initialize a new HardHat project by running:

    ```sh
    npx hardhat
    ```

5. Follow the prompts to set up your HardHat project. You can accept the default answers.

### Start the HardHat Node

Start the local test node with:

```sh
npx hardhat node
```

You will see a list of test accounts in the console output, for example:

```
> npx hardhat node
Started HTTP and WebSocket JSON-RPC server at http://127.0.0.1:8545/

Accounts
========

WARNING: These accounts, and their private keys, are publicly known.
Any funds sent to them on Mainnet or any other live network WILL BE LOST.

Account #0: 0xf39...266 (10000 ETH)
Private Key: 0xac09...f80

Account #1: 0x709...9C8 (10000 ETH)
Private Key: 0x59c6...90d

...
```

For testing, you can use any of the listed accounts. They are pre-funded with test tokens.

### Configure Your MetaMask Wallet

You need to connect MetaMask to your local test network.

#### Connect MetaMask to the Local HardHat Network

To connect MetaMask to your local HardHat network:

1. Open MetaMask and click the network dropdown at the top.
2. Select **Add network** (or **Add network manually**).
3. Enter the following details:
    - **Network Name:** HardHat Localhost
    - **New RPC URL:** http://127.0.0.1:8545/
    - **Chain ID:** 31337
    - **Currency Symbol:** ETH
    - **Block Explorer URL:** (leave blank)
4. Click **Save**.

MetaMask will now use your local HardHat node as the network.

#### Import a Test Account into MetaMask

To use one of the HardHat test accounts in MetaMask:

1. In the HardHat node output, copy the **private key** of the account you want to use.
2. Open MetaMask and click your account icon (at the top center of the MetaMask interface).
3. Select **Add Account**.
4. Choose **From Private Key**.
5. Paste the copied private key into the field.
6. Click **Import**.

The test account will now appear in your MetaMask wallet, and you can use its pre-funded test ETH for transactions.

Make sure to select the _test network_ as your current network (dropdown in the top left corner of MetaMask), and your _test account_ as your current account (dropdown at the top center of MetaMask). You should see your test account pre-funded with 10000 ETH. If the balance does not appear immediately, try switching networks in MetaMask.

## Go to the Site

Open the [OGOO site](https://ogoo.io).

The site will prompt you to connect your MetaMask wallet. Follow the instructions.

If everything is set up correctly, you will see your account number and ETH balance displayed under the site’s top menu. The wallet selector in the top right corner should show the MetaMask icon and name.

## Offer Manipulations

### Create an Offer

Create a new Offer using the **Create Offer** button on the starting page, or the correspondent application menu option. After the Offer has been created, it should be listed in the common offers list, as well as in the managed offers list. After you commit the transaction in the MetaMask, you can continue editing the Offer.

### Add Observers

After the Offer is created, you will be directed to the offer editing page. You can open it from the Managed Offers List by pressing the **Edit** button.

Use offer editing page to ycreate observers of the offer. You can add pre-funded accounts created by the HardHat test node as observers.

### Approve the Offer

Approve the offer from the Managed Offers List by pressing the **Approve** button.

### Check the Offer status

**TODO**


### Contribute to the Offer

**TODO**

### Vote as a Contributor

**TODO**

### Vote as an Observer

**TODO**

### Complete voting and check the status of the contender

**TODO**
