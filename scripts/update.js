// interact.js


const API_KEY = process.env.API_KEY

const API_URL = process.env.API_URL

const PRIVATE_KEY = process.env.PRIVATE_KEY

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS

const contract = require("../artifacts/contracts/hello_world.sol/HelloWorld.json")

console.log('The contract:', JSON.stringify(contract.abi, null, '    '))

// Provider
const alchemyProvider =  ethers.getDefaultProvider(
    (network = "sepolia"),
    (options = {
        alchemy: API_KEY,
        etherscan: API_KEY
    })
)

// Signer
const signer = new ethers.Wallet(PRIVATE_KEY, alchemyProvider)

// Contract
const helloWorldContract = new ethers.Contract(
  CONTRACT_ADDRESS,
  contract.abi,
  signer
)

async function main() {
  message = await helloWorldContract.message()
  console.log("The message was: " + message)
  tx = await helloWorldContract.update('Hello Contract - ' + (new Date()))
  await tx.wait()
  message = await helloWorldContract.message()
  console.log("The message now: " + message)
}

main()
