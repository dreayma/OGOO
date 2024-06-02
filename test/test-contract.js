const { expect, should } = require("chai");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

should();

function to$(wei) {
  var cents_per_ether = 300000n;
  var weis_per_ether = 1000000000000000000n;
  return hre.ethers.toNumber((wei * cents_per_ether) / weis_per_ether ) / 100.;
}

describe("Contract Tests", function () {
  var test_definition = {
        "caption": "Test",
        "description": "Test Description",
        "full_details": "Test Details",
        "share_unlock_timeout": 1n,
        "observer_award": 0n,
        "share_min_balance": 30000000000000000n,
        "observers_vote_share": 10000n,
        "shareholders_vote_share": 10000n,
        "shareholders_vote_amount_share": 10000n,
  };
  var test_definition_values = [];
  for(var k in test_definition) {
    test_definition_values.push(test_definition[k]);
  }

  it("Test the contract access", async function () {
    console.log("Setting up the contract");
    var accounts = await hre.ethers.getSigners();
    var account_owner = accounts[0]; // the first account will be a signer to check an access from the owner
    var start_balance = await account_owner.provider.getBalance(account_owner.address);
    console.debug("Owner account before deployment:", start_balance);
    var Offer = await ethers.getContractFactory("Offer", account_owner);
    // Start deployment, returning a promise that resolves to a contract object
    var offer = await Offer.deploy(test_definition);
    console.info("Waiting for deployment...");
    var v = await offer.waitForDeployment();
    console.info("Contract deployed to address:", offer.target);
    var end_balance = await account_owner.provider.getBalance(account_owner.address);
    var diff = start_balance - end_balance;
    console.debug("Owner account after deployment:", end_balance, "Diff WEI:", diff, "Amount $:", to$(diff));
    console.info("Contract owner is:", await offer.owner());

    var account_owner = accounts[0]; // the first account will be a signer to check an access from the owner
    var account_observer = accounts[1]; // the account will be a signer to check an access from the observer
    var account_shareholder = accounts[2]; // the account will be a signer to check an access from the shareholder
    var account_contractor = accounts[3]; // the account will be a signer to check an access from the contractor
    var account_outside = accounts[4]; // the account will be a signer to check an access from the outside
    var contract_abi = require("../artifacts/contracts/ogoo.sol/Offer.json");

    // Gettings access from the owner
    var o = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_owner, // Signer to get access to the contract
    )

    // Getting access from the observer
    var observer_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_observer, // Observer account trying access to the contract
    )

    // Getting access from the shareholder
    var shareholder_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_shareholder, // Shareholder account trying access to the contract
    )

    // Getting access from the contractor
    var contractor_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_contractor, // Contractor account trying access to the contract
    )

    // Getting access from the outside
    var outside_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_outside, // Outside account trying access to the contract
    )

    await o.waitForDeployment();
    var owner = await o.owner();
    expect(owner).to.equal(account_owner.address);
    var definition = await o.definition();
    expect(test_definition_values).to.have.deep.members(definition);

    var start_balance_shareholder = await account_shareholder.provider.getBalance(account_shareholder.address);
    console.debug("Shareholder account before creating share:", start_balance_shareholder);

    var start_balance_owner = await account_owner.provider.getBalance(account_owner.address);
    console.debug("Owner account before creating share:", start_balance_owner);

    var start_balance_offer = await account_owner.provider.getBalance(offer.target);
    console.debug("Offer account before creating share:", start_balance_offer);

    // the shareholder can create share not less than a share_min_balance
    shareholder_access.share_create().should.eventually.rejectedWith('reverted');
    shareholder_access.share_create({value: 20000000000000001n}).should.eventually.rejectedWith('reverted');

    var create_share_estimate_gas = await shareholder_access.share_create.estimateGas({value: 30000000000000001n});
    console.debug("Create share estimated gas:", create_share_estimate_gas);

    var gas_price = (await account_shareholder.provider.getFeeData()).gasPrice;
    console.debug("Gas Price:", gas_price);

    console.debug("Create share calculated gas price:", gas_price * create_share_estimate_gas);

    // the shareholder created an account sending there an amount
    var txs = await shareholder_access.share_create({value: 30000000000000001n});
    var txs_receipt = await txs.wait();

    var end_balance_shareholder = await account_shareholder.provider.getBalance(account_shareholder.address);
    var diff = start_balance_shareholder - end_balance_shareholder;
    console.debug("Shareholder account after creating share:", end_balance_shareholder, "Diff WEI:", diff, "Amount $:", to$(diff));

    var end_balance_owner = await account_owner.provider.getBalance(account_owner.address);
    console.debug("Owner account after creating share:", end_balance_owner);

    var end_balance_offer = await account_owner.provider.getBalance(offer.target);
    console.debug("Offer account after creating share:", end_balance_offer);

//     // everybody can get access to only his own address
//     outside_access.interface.parseError(
//         // try ... catch(e) { parseError(e.data) ...
//         (await outside_access.share_get_for_origin().should.eventually.rejectedWith('reverted')).data
//     ).name.should.be.equal('EnumerableMapNonexistentKey')

    var outside_share = await outside_access.share_get_for_origin();
    outside_share.should.be.equal(0n);

    var shareholder_share = await shareholder_access.share_get_for_origin();
    shareholder_share.should.be.equal(30000000000000001n);

    await new Promise(resolve => setTimeout(resolve, 1000));
    var txo1 = await o.observer_create(account_outside.address);
    var txo1_receipt = await txo1.wait();

    console.log("Registered observer address to cancel:", account_outside.address);

    await new Promise(resolve => setTimeout(resolve, 1000));
    var txo1c = await o.observer_remove(account_outside.address);
    var txo1c_receipt = await txo1c.wait();

    // Cancelled => removed
    o.observer_remove(account_outside.address).should.eventually.rejectedWith('reverted');

    // Approve the contract, observer list can not be extended
    await new Promise(resolve => setTimeout(resolve, 1000));
    var txo = await o.approve();
    var txo_receipt = await txo.wait();

    o.interface.parseError(
        // try ... catch(e) { parseError(e.data) ...
        (await o.observer_create(account_outside.address).should.eventually.rejectedWith('reverted')).data
    ).name.should.be.equal('PreparedOnly')

    o.interface.parseError(
        // try ... catch(e) { parseError(e.data) ...
        (await o.observer_remove(account_outside.address).should.eventually.rejectedWith('reverted')).data
    ).name.should.be.equal('PreparedOnly')
  });

});
