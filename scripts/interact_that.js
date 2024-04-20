// interact.js


const API_KEY = process.env.API_KEY

const API_URL = process.env.API_URL

const PRIVATE_KEY = process.env.PRIVATE_KEY

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS

const contract = require("../artifacts/contracts/hello_world.sol/HelloWorld.json")

console.log('The conract ABI:', JSON.stringify(contract.abi, null, '    '))

// Provider
const alchemyProvider =  ethers.getDefaultProvider(
    (network = "sepolia"),
    (options = {
        alchemy: API_KEY,
        etherscan: API_KEY
    })
//    API_KEY
)

console.log('Provider:', alchemyProvider)

// Signer
const signer = new ethers.Wallet(PRIVATE_KEY, alchemyProvider)

console.log('Signer:', signer)

// Contract
const helloWorldContract = new ethers.Contract(
  CONTRACT_ADDRESS,
  contract.abi,
  signer
)

console.log('Contract:', helloWorldContract)

async function main() {
    console.info("Waiting for deployment:", CONTRACT_ADDRESS);
    await helloWorldContract.waitForDeployment();
    console.info("Waiting for that:", CONTRACT_ADDRESS);
    that = await helloWorldContract.that();
    console.log("That is: ", that);
    res = await helloWorldContract.doit();
    console.log("Waiting for the transaction:", that);
    r = await res.wait();
    console.log("??????????????", r);
    doit_txorigin = await helloWorldContract.doit_txorigin();
    dothat_txorigin = await helloWorldContract.dothat_txorigin();
    doit_sender = await helloWorldContract.doit_sender();
    dothat_sender = await helloWorldContract.dothat_sender();
    console.log("txorigin it, that, sender it, that:", doit_txorigin, dothat_txorigin, doit_sender, dothat_sender);
}

main()
