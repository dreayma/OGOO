// interact.js


// const API_KEY = process.env.API_KEY
// 
// const API_URL = process.env.API_URL
// 
// const PRIVATE_KEY = process.env.PRIVATE_KEY

const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS

// const contract = require("../artifacts/contracts/ogoo.sol/Offer.json")

// console.log('The conract ABI:', JSON.stringify(contract.abi, null, '    '))

// // Provider
// const alchemyProvider =  ethers.getDefaultProvider(
//     (network = "sepolia"),
//     (options = {
//         alchemy: API_KEY,
//         etherscan: API_KEY
//     })
// //    API_KEY
// )
// 
// console.log('Provider:', alchemyProvider)
// 
// // Signer
// const signer = new ethers.Wallet(PRIVATE_KEY, alchemyProvider)
// 
// console.log('Signer:', signer)
// 
// // Contract
// const helloWorldContract = new ethers.Contract(
//   CONTRACT_ADDRESS,
//   contract.abi,
//   signer
// )
// 
// console.log('Contract:', helloWorldContract)
// // Contract
// const offerContract = new ethers.Contract(
//   CONTRACT_ADDRESS,
//   contract.abi,
//   //signer
// )
// 
// console.log('Contract:', offerContract)
// 
// async function main() {
//   owner = await offerContract.owner()
//   console.log("The awner was: " + owner)
// }
// 
// main()

async function main() {
    const accounts = await hre.ethers.getSigners();
    const account_owner = accounts[0]; // the first account will be a signer to check an access from the owner
    const account_outside = accounts[1]; // the second account will be a signer to check an access from the outside
    const contract_abi = require("../artifacts/contracts/ogoo.sol/Offer.json");
    const o = new ethers.Contract(
      CONTRACT_ADDRESS,
      contract_abi.abi,
      account_outside, // Signer to get access to the contract
    )
    await o.waitForDeployment();
    console.log("Contract was deployed to address:", o.target);
    owner = await o.owner();
    console.log("Contract owner is, should be equal to the first account:", owner, owner == account_owner.address);
}

main()
