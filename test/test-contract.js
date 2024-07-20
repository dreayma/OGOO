const { expect, should } = require("chai");

should();

function to$(wei) {
  var cents_per_ether = 300000n;
  var weis_per_ether = 1000000000000000000n;
  return hre.ethers.toNumber((wei * cents_per_ether) / weis_per_ether ) / 100.;
}

describe("Contract Tests", function () {
  it("Test the contract life circle main path", async function () {
    console.log("Test the contract life circle main path");
    var test_definition = {
        "caption": "Test",
        "description": "Test Description",
        "full_details": "Test Details",
        "share_unlock_timeout": 1n,
        "observer_award": 0n,
        "share_min_balance": 30000000000000000n,
        "voting_start_balance": 0n,
        "voting_start_count": 0n,
        "voting_start_timeout": 3600n,
        "voting_fail_timeout": 3600n,
        "observers_vote_share": 10000n,
        "shareholders_vote_share": 10000n,
        "shareholders_vote_amount_share": 10000n,
    };
    var test_definition_values = [];
    for(var k in test_definition) {
        test_definition_values.push(test_definition[k]);
    }
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
    await new Promise(resolve => setTimeout(resolve, 1000));
    // test updating the definition
    test_definition.shareholders_vote_amount_share = 9900n;
    var txod = await o.definition_update(test_definition);
    var txod_receipt = await txod.wait();
    await new Promise(resolve => setTimeout(resolve, 1000));
    definition = await o.definition();
    test_definition_values = [];
    for(var k in test_definition) {
      test_definition_values.push(test_definition[k]);
    }
    expect(test_definition_values).to.have.deep.members(definition);

    var start_balance_shareholder = await account_shareholder.provider.getBalance(account_shareholder.address);
    console.debug("Shareholder account before creating share:", start_balance_shareholder);

    var start_balance_owner = await account_owner.provider.getBalance(account_owner.address);
    console.debug("Owner account before creating share:", start_balance_owner);

    var start_balance_offer = await account_owner.provider.getBalance(offer.target);
    console.debug("Offer account before creating share:", start_balance_offer);

    // test the shareholder share_min_balance
    shareholder_access.share_create().should.eventually.rejectedWith('reverted');
    shareholder_access.share_create({value: 20000000000000001n}).should.eventually.rejectedWith('reverted');

    var create_share_estimate_gas = await shareholder_access.share_create.estimateGas({value: 30000000000000001n});
    console.debug("Create share estimated gas:", create_share_estimate_gas);

    var gas_price = (await account_shareholder.provider.getFeeData()).gasPrice;
    console.debug("Gas Price:", gas_price);

    console.debug("Create share calculated gas price:", gas_price * create_share_estimate_gas);

    // test the shareholder created an account sending there enough amount
    var txs = await shareholder_access.share_create({value: 30000000000000001n});
    var txs_receipt = await txs.wait();

    var end_balance_shareholder = await account_shareholder.provider.getBalance(account_shareholder.address);
    var diff = start_balance_shareholder - end_balance_shareholder;
    console.debug("Shareholder account after creating share:", end_balance_shareholder, "Diff WEI:", diff, "Amount $:", to$(diff));

    end_balance_offer = await account_owner.provider.getBalance(offer.target);
    console.debug("Offer account after creating share:", end_balance_offer);

    // test the shareholder can increase the balance
    txs = await shareholder_access.share_create({value: 10000000000000001n});
    txs_receipt = await txs.wait();

    end_balance_shareholder = await account_shareholder.provider.getBalance(account_shareholder.address);
    diff = start_balance_shareholder - end_balance_shareholder;
    console.debug("Shareholder account after updating share:", end_balance_shareholder, "Diff WEI:", diff, "Amount $:", to$(diff));

    end_balance_offer = await account_owner.provider.getBalance(offer.target);
    console.debug("Offer account after updating share:", end_balance_offer);

    var end_balance_owner = await account_owner.provider.getBalance(account_owner.address);
    console.debug("Owner account after creating share:", end_balance_owner);

    // test access to the origin's share
    var outside_share = await outside_access.share_get_for_origin();
    outside_share.should.be.equal(0n);

    var shareholder_share = await shareholder_access.share_get_for_origin();
    shareholder_share.should.be.equal(40000000000000002n);

    // testing observers creation
    await new Promise(resolve => setTimeout(resolve, 1000));
    var txo1 = await o.observer_create(account_outside.address);
    var txo1_receipt = await txo1.wait();

    console.log("Registered observer address to cancel:", account_outside.address);

    await new Promise(resolve => setTimeout(resolve, 1000));
    var txo2 = await o.observer_create(account_observer.address);
    var txo2_receipt = await txo2.wait();

    console.log("Registered observer address to work with:", account_observer.address);

    await new Promise(resolve => setTimeout(resolve, 1000));
    // test observer's removing
    var txo1c = await o.observer_remove(account_outside.address);
    var txo1c_receipt = await txo1c.wait();

    // test removing absent observer
    await new Promise(resolve => setTimeout(resolve, 1000));
    o.observer_remove(account_outside.address).should.eventually.rejectedWith('reverted');

    // Approve the contract to make it unmutable
    await new Promise(resolve => setTimeout(resolve, 1000));
    var txo = await o.approve();
    var txo_receipt = await txo.wait();

    // Trying to modify observers list should be failed
    o.interface.parseError(
        // try ... catch(e) { parseError(e.data) ...
        (await o.observer_create(account_outside.address).should.eventually.rejectedWith('reverted')).data
    ).name.should.be.equal('PreparedOnly');

    o.interface.parseError(
        // try ... catch(e) { parseError(e.data) ...
        (await o.observer_remove(account_outside.address).should.eventually.rejectedWith('reverted')).data
    ).name.should.be.equal('PreparedOnly');

    // voting process
    var state = await contractor_access.state();
    console.log('State before first vote', state);
    state.should.be.equal(1n);
    await new Promise(resolve => setTimeout(resolve, 1000));
    var txsv = await shareholder_access.share_vote(account_contractor.address, false);
    var txsv_receipt = await txsv.wait();
    await new Promise(resolve => setTimeout(resolve, 1000));
    var txac = await contractor_access.calculate_voting();
    var txac_receipt = await txac.wait();
    await new Promise(resolve => setTimeout(resolve, 1000));
    state = await contractor_access.state();
    console.log('State after shareholder vote', state)
    state.should.be.equal(1n);

    var start_balance_contractor = await account_contractor.provider.getBalance(account_contractor.address);
    console.debug("Contractor account before contract success:", start_balance_contractor);

    await new Promise(resolve => setTimeout(resolve, 1000));
    var txov = await observer_access.observer_vote(account_contractor.address, false);
    var txov_receipt = await txov.wait();
    await new Promise(resolve => setTimeout(resolve, 1000));
    var txac1 = await contractor_access.calculate_voting();
    var txac1_receipt = await txac1.wait();
    await new Promise(resolve => setTimeout(resolve, 1000));
    state = await contractor_access.state();
    console.log('State after observer vote', state);
    state.should.be.equal(2n);
    var final_balance_offer = await account_owner.provider.getBalance(offer.target);
    console.debug("Offer account after contract completion", final_balance_offer);
    final_balance_offer.should.be.equal(0n);

    var end_balance_contractor = await account_contractor.provider.getBalance(account_contractor.address);
    console.debug("Contractor account after contract success:", end_balance_contractor);
    console.debug("Contractor account diff after contract success ($):", to$(end_balance_contractor - start_balance_contractor));

  });
  it("Test the case without observers", async function () {
    console.log("Test the case without observers");
    var test_definition = {
        "caption": "Test",
        "description": "Test Description",
        "full_details": "Test Details",
        "share_unlock_timeout": 1n,
        "observer_award": 0n,
        "share_min_balance": 30000000000000000n,
        "voting_start_balance": 0n,
        "voting_start_count": 0n,
        "voting_start_timeout": 3600n,
        "voting_fail_timeout": 3600n,
        "observers_vote_share": 10000n,
        "shareholders_vote_share": 10000n,
        "shareholders_vote_amount_share": 10000n,
    };
    var test_definition_values = [];
    for(var k in test_definition) {
        test_definition_values.push(test_definition[k]);
    }
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
    var account_shareholder = accounts[1]; // the account will be a signer to check an access from the shareholder
    var account_shareholder2 = accounts[2]; // the account will be a signer to check an access from the shareholder
    var account_contractor = accounts[3]; // the account will be a signer to check an access from the contractor
    var account_outside = accounts[4]; // the account will be a signer to check an access from the outside
    var contract_abi = require("../artifacts/contracts/ogoo.sol/Offer.json");

    // Gettings access from the owner
    var o = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_owner, // Signer to get access to the contract
    )

    // Getting access from the shareholder
    var shareholder_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_shareholder, // Shareholder account trying access to the contract
    )
    var shareholder2_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_shareholder2, // Shareholder account trying access to the contract
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
    await new Promise(resolve => setTimeout(resolve, 1000));

    var start_balance_shareholder = await account_shareholder.provider.getBalance(account_shareholder.address);
    console.debug("Shareholder account before creating share:", start_balance_shareholder);
    var start_balance_shareholder2 = await account_shareholder2.provider.getBalance(account_shareholder2.address);
    console.debug("Shareholder2 account before creating share:", start_balance_shareholder2);

    var start_balance_owner = await account_owner.provider.getBalance(account_owner.address);
    console.debug("Owner account before creating share:", start_balance_owner);

    var start_balance_offer = await account_owner.provider.getBalance(offer.target);
    console.debug("Offer account before creating share:", start_balance_offer);

    // test the shareholder share_min_balance
    shareholder_access.share_create().should.eventually.rejectedWith('reverted');
    shareholder_access.share_create({value: 20000000000000001n}).should.eventually.rejectedWith('reverted');

    // test the shareholder created an account sending there enough amount
    {
      var txs = await shareholder_access.share_create({value: 30000000000000001n});
      var txs_receipt = await txs.wait();
    }
    {
      var txs = await shareholder2_access.share_create({value: 30000000000000001n});
      var txs_receipt = await txs.wait();
    }
    {
      var end_balance_shareholder = await account_shareholder.provider.getBalance(account_shareholder.address);
      var diff = start_balance_shareholder - end_balance_shareholder;
      console.debug("Shareholder account after creating share:", end_balance_shareholder, "Diff WEI:", diff, "Amount $:", to$(diff));
    }
    {
      var end_balance_shareholder2 = await account_shareholder2.provider.getBalance(account_shareholder2.address);
      var diff = start_balance_shareholder2 - end_balance_shareholder2;
      console.debug("Shareholder2 account after creating share:", end_balance_shareholder2, "Diff WEI:", diff, "Amount $:", to$(diff));
    }

    end_balance_offer = await account_owner.provider.getBalance(offer.target);
    console.debug("Offer account after creating share:", end_balance_offer);

    var end_balance_owner = await account_owner.provider.getBalance(account_owner.address);
    console.debug("Owner account after creating share:", end_balance_owner);

    // test access to the origin's share
    var outside_share = await outside_access.share_get_for_origin();
    outside_share.should.be.equal(0n);

    {
      var shareholder_share = await shareholder_access.share_get_for_origin();
      shareholder_share.should.be.equal(30000000000000001n);
    }
    {
      var shareholder2_share = await shareholder2_access.share_get_for_origin();
      shareholder2_share.should.be.equal(30000000000000001n);
    }

    // Approve the contract to make it unmutable
    await new Promise(resolve => setTimeout(resolve, 1000));
    var txo = await o.approve();
    var txo_receipt = await txo.wait();

    // Trying to modify observers list should be failed
    o.interface.parseError(
        // try ... catch(e) { parseError(e.data) ...
        (await o.observer_create(account_outside.address).should.eventually.rejectedWith('reverted')).data
    ).name.should.be.equal('PreparedOnly');

    o.interface.parseError(
        // try ... catch(e) { parseError(e.data) ...
        (await o.observer_remove(account_outside.address).should.eventually.rejectedWith('reverted')).data
    ).name.should.be.equal('PreparedOnly');

    // voting process
    var state = await contractor_access.state();
    console.log('State before first vote', state);
    state.should.be.equal(1n);

    var start_balance_contractor = await account_contractor.provider.getBalance(account_contractor.address);
    console.debug("Contractor account before contract success:", start_balance_contractor);

    await new Promise(resolve => setTimeout(resolve, 1000));
    {
      var txsv = await shareholder_access.share_vote(account_contractor.address, false);
      var txsv_receipt = await txsv.wait();
    }
    console.debug("Shareholder has just voted");
    {
      var txsv = await shareholder2_access.share_vote(account_contractor.address, false);
      var txsv_receipt = await txsv.wait();
    }
    console.debug("Shareholder2 has just voted");
    await new Promise(resolve => setTimeout(resolve, 1000));
    var txac = await contractor_access.calculate_voting();
    var txac_receipt = await txac.wait();
    console.debug("Voting has just recalculated");
    await new Promise(resolve => setTimeout(resolve, 1000));
    state = await contractor_access.state();
    console.log('State after shareholders vote', state)
    state.should.be.equal(2n);

    var final_balance_offer = await account_owner.provider.getBalance(offer.target);
    console.debug("Offer account after contract completion", final_balance_offer);
    final_balance_offer.should.be.equal(0n);

    var end_balance_contractor = await account_contractor.provider.getBalance(account_contractor.address);
    console.debug("Contractor account after contract success:", end_balance_contractor);
    console.debug("Contractor account diff after contract success ($):", to$(end_balance_contractor - start_balance_contractor));
  });
  it("Test the share unlock timeout preventing share cancelling", async function () {
    console.log("Test the share unlock timeout preventing share cancelling");
    var test_definition = {
        "caption": "Test",
        "description": "Test Description",
        "full_details": "Test Details",
        "share_unlock_timeout": 120n,
        "observer_award": 0n,
        "share_min_balance": 30000000000000000n,
        "voting_start_balance": 0n,
        "voting_start_count": 0n,
        "voting_start_timeout": 3600n,
        "voting_fail_timeout": 3600n,
        "observers_vote_share": 10000n,
        "shareholders_vote_share": 10000n,
        "shareholders_vote_amount_share": 10000n,
    };
    var test_definition_values = [];
    for(var k in test_definition) {
        test_definition_values.push(test_definition[k]);
    }
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
    var account_shareholder = accounts[1]; // the account will be a signer to check an access from the shareholder
    var account_shareholder2 = accounts[2]; // the account will be a signer to check an access from the shareholder
    var account_contractor = accounts[3]; // the account will be a signer to check an access from the contractor
    var account_outside = accounts[4]; // the account will be a signer to check an access from the outside
    var contract_abi = require("../artifacts/contracts/ogoo.sol/Offer.json");

    // Gettings access from the owner
    var o = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_owner, // Signer to get access to the contract
    )

    // Getting access from the shareholder
    var shareholder_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_shareholder, // Shareholder account trying access to the contract
    )
    var shareholder2_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_shareholder2, // Shareholder account trying access to the contract
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
    await new Promise(resolve => setTimeout(resolve, 1000));

    var start_balance_shareholder = await account_shareholder.provider.getBalance(account_shareholder.address);
    console.debug("Shareholder account before creating share:", start_balance_shareholder);
    var start_balance_shareholder2 = await account_shareholder2.provider.getBalance(account_shareholder2.address);
    console.debug("Shareholder2 account before creating share:", start_balance_shareholder2);

    var start_balance_owner = await account_owner.provider.getBalance(account_owner.address);
    console.debug("Owner account before creating share:", start_balance_owner);

    var start_balance_offer = await account_owner.provider.getBalance(offer.target);
    console.debug("Offer account before creating share:", start_balance_offer);

    // test the shareholder share_min_balance
    shareholder_access.share_create().should.eventually.rejectedWith('reverted');
    shareholder_access.share_create({value: 20000000000000001n}).should.eventually.rejectedWith('reverted');

    // test the shareholder created an account sending there enough amount
    {
      var txs = await shareholder_access.share_create({value: 30000000000000001n});
      var txs_receipt = await txs.wait();
    }
    {
      var txs = await shareholder2_access.share_create({value: 30000000000000001n});
      var txs_receipt = await txs.wait();
    }
    {
      var end_balance_shareholder = await account_shareholder.provider.getBalance(account_shareholder.address);
      var diff = start_balance_shareholder - end_balance_shareholder;
      console.debug("Shareholder account after creating share:", end_balance_shareholder, "Diff WEI:", diff, "Amount $:", to$(diff));
    }
    {
      var end_balance_shareholder2 = await account_shareholder2.provider.getBalance(account_shareholder2.address);
      var diff = start_balance_shareholder2 - end_balance_shareholder2;
      console.debug("Shareholder2 account after creating share:", end_balance_shareholder2, "Diff WEI:", diff, "Amount $:", to$(diff));
    }

    end_balance_offer = await account_owner.provider.getBalance(offer.target);
    console.debug("Offer account after creating share:", end_balance_offer);

    var end_balance_owner = await account_owner.provider.getBalance(account_owner.address);
    console.debug("Owner account after creating share:", end_balance_owner);

    // test access to the origin's share
    var outside_share = await outside_access.share_get_for_origin();
    outside_share.should.be.equal(0n);

    {
      var shareholder_share = await shareholder_access.share_get_for_origin();
      shareholder_share.should.be.equal(30000000000000001n);
    }
    {
      var shareholder2_share = await shareholder2_access.share_get_for_origin();
      shareholder2_share.should.be.equal(30000000000000001n);
    }

    // Approve the contract to make it unmutable
    await new Promise(resolve => setTimeout(resolve, 1000));
    var txo = await o.approve();
    var txo_receipt = await txo.wait();

    // voting process
    var state = await contractor_access.state();
    console.log('State before first vote', state);
    state.should.be.equal(1n);

    var start_balance_contractor = await account_contractor.provider.getBalance(account_contractor.address);
    console.debug("Contractor account before contract success:", start_balance_contractor);

    await new Promise(resolve => setTimeout(resolve, 1000));
    {
      var txsv = await shareholder_access.share_vote(account_contractor.address, false);
      var txsv_receipt = await txsv.wait();
    }
    console.debug("Shareholder has just voted");
    {
      var txsv = await shareholder2_access.share_cancel();
      var txsv_receipt = await txsv.wait();
    }
    console.debug("Shareholder2 has just cancelled share");
    {
      var time_to_cancel = await shareholder2_access.share_can_be_canceled(account_shareholder2.address);
      console.log("Shareholder2 time to cancel", time_to_cancel);
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
    var txac = await contractor_access.calculate_voting();
    var txac_receipt = await txac.wait();
    console.debug("Voting has just recalculated");
    await new Promise(resolve => setTimeout(resolve, 1000));
    state = await contractor_access.state();
    console.log('State after shareholders vote', state)
    state.should.be.equal(2n);

    var final_balance_offer = await account_owner.provider.getBalance(offer.target);
    console.debug("Offer account after contract completion", final_balance_offer);
    final_balance_offer.should.be.equal(0n);

    var end_balance_contractor = await account_contractor.provider.getBalance(account_contractor.address);
    console.debug("Contractor account after contract success:", end_balance_contractor);
    console.debug("Contractor account diff after contract success ($):", to$(end_balance_contractor - start_balance_contractor));
  });
  it("Test the share unlock timeout success share cancelling", async function () {
    console.log("Test the share unlock timeout success share cancelling");
    var test_definition = {
        "caption": "Test",
        "description": "Test Description",
        "full_details": "Test Details",
        "share_unlock_timeout": 10n,
        "observer_award": 0n,
        "share_min_balance": 30000000000000000n,
        "voting_start_balance": 0n,
        "voting_start_count": 0n,
        "voting_start_timeout": 3600n,
        "voting_fail_timeout": 3600n,
        "observers_vote_share": 10000n,
        "shareholders_vote_share": 10000n,
        "shareholders_vote_amount_share": 10000n,
    };
    var test_definition_values = [];
    for(var k in test_definition) {
        test_definition_values.push(test_definition[k]);
    }
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
    var account_shareholder = accounts[1]; // the account will be a signer to check an access from the shareholder
    var account_shareholder2 = accounts[2]; // the account will be a signer to check an access from the shareholder
    var account_contractor = accounts[3]; // the account will be a signer to check an access from the contractor
    var account_outside = accounts[4]; // the account will be a signer to check an access from the outside
    var contract_abi = require("../artifacts/contracts/ogoo.sol/Offer.json");

    // Gettings access from the owner
    var o = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_owner, // Signer to get access to the contract
    )

    // Getting access from the shareholder
    var shareholder_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_shareholder, // Shareholder account trying access to the contract
    )
    var shareholder2_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_shareholder2, // Shareholder account trying access to the contract
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
    await new Promise(resolve => setTimeout(resolve, 1000));

    var start_balance_shareholder = await account_shareholder.provider.getBalance(account_shareholder.address);
    console.debug("Shareholder account before creating share:", start_balance_shareholder);
    var start_balance_shareholder2 = await account_shareholder2.provider.getBalance(account_shareholder2.address);
    console.debug("Shareholder2 account before creating share:", start_balance_shareholder2);

    var start_balance_owner = await account_owner.provider.getBalance(account_owner.address);
    console.debug("Owner account before creating share:", start_balance_owner);

    var start_balance_offer = await account_owner.provider.getBalance(offer.target);
    console.debug("Offer account before creating share:", start_balance_offer);

    // test the shareholder share_min_balance
    shareholder_access.share_create().should.eventually.rejectedWith('reverted');
    shareholder_access.share_create({value: 20000000000000001n}).should.eventually.rejectedWith('reverted');

    // test the shareholder created an account sending there enough amount
    {
      var txs = await shareholder_access.share_create({value: 30000000000000001n});
      var txs_receipt = await txs.wait();
    }
    {
      var txs = await shareholder2_access.share_create({value: 30000000000000001n});
      var txs_receipt = await txs.wait();
    }
    {
      var end_balance_shareholder = await account_shareholder.provider.getBalance(account_shareholder.address);
      var diff = start_balance_shareholder - end_balance_shareholder;
      console.debug("Shareholder account after creating share:", end_balance_shareholder, "Diff WEI:", diff, "Amount $:", to$(diff));
    }
    {
      var end_balance_shareholder2 = await account_shareholder2.provider.getBalance(account_shareholder2.address);
      var diff = start_balance_shareholder2 - end_balance_shareholder2;
      console.debug("Shareholder2 account after creating share:", end_balance_shareholder2, "Diff WEI:", diff, "Amount $:", to$(diff));
    }

    end_balance_offer = await account_owner.provider.getBalance(offer.target);
    console.debug("Offer account after creating share:", end_balance_offer);

    var end_balance_owner = await account_owner.provider.getBalance(account_owner.address);
    console.debug("Owner account after creating share:", end_balance_owner);

    // test access to the origin's share
    var outside_share = await outside_access.share_get_for_origin();
    outside_share.should.be.equal(0n);

    {
      var shareholder_share = await shareholder_access.share_get_for_origin();
      shareholder_share.should.be.equal(30000000000000001n);
    }
    {
      var shareholder2_share = await shareholder2_access.share_get_for_origin();
      shareholder2_share.should.be.equal(30000000000000001n);
    }

    // Approve the contract to make it unmutable
    await new Promise(resolve => setTimeout(resolve, 1000));
    var txo = await o.approve();
    var txo_receipt = await txo.wait();

    // voting process
    var state = await contractor_access.state();
    console.log('State before first vote', state);
    state.should.be.equal(1n);

    var start_balance_contractor = await account_contractor.provider.getBalance(account_contractor.address);
    console.debug("Contractor account before contract success:", start_balance_contractor);

    await new Promise(resolve => setTimeout(resolve, 1000));
    {
      var txsv = await shareholder_access.share_vote(account_contractor.address, false);
      var txsv_receipt = await txsv.wait();
    }
    console.debug("Shareholder has just voted");
    {
      var txsv = await shareholder2_access.share_cancel();
      var txsv_receipt = await txsv.wait();
    }
    console.debug("Shareholder2 has just cancelled share");
    while(42) {
      var time_to_cancel = await shareholder2_access.share_can_be_canceled(account_shareholder2.address);
      if( !time_to_cancel )
        break;
      console.log("Shareholder2 time to cancel", time_to_cancel);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    {
      var txsv = await shareholder2_access.share_cancel();
      var txsv_receipt = await txsv.wait();
    }
    {
      var interm_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account after cancel share", interm_balance_offer);
      interm_balance_offer.should.be.equal(30000000000000001n);
    }
    console.debug("Shareholder2 has just successfully cancelled share");
    await new Promise(resolve => setTimeout(resolve, 1000));
    var txac = await contractor_access.calculate_voting();
    var txac_receipt = await txac.wait();
    console.debug("Voting has just recalculated");
    await new Promise(resolve => setTimeout(resolve, 1000));
    state = await contractor_access.state();
    console.log('State after shareholders vote', state)
    state.should.be.equal(2n);

    var final_balance_offer = await account_owner.provider.getBalance(offer.target);
    console.debug("Offer account after contract completion", final_balance_offer);
    final_balance_offer.should.be.equal(0n);

    var end_balance_contractor = await account_contractor.provider.getBalance(account_contractor.address);
    console.debug("Contractor account after contract success:", end_balance_contractor);
    console.debug("Contractor account diff after contract success ($):", to$(end_balance_contractor - start_balance_contractor));
  });
  it("Test the voting start balance", async function () {
    console.log('TODO');
  });
  it("Test the voting start count", async function () {
    console.log('TODO');
  });
  it("Test the voting start count", async function () {
    console.log('TODO');
  });
  it("Test the voting start timeout", async function () {
    console.log('TODO');
  });
  it("Test the voting fail timeout", async function () {
    console.log('TODO');
  });
  it("Test the voting conflict", async function () {
    console.log('TODO');
  });
  it("Test the observers vote share", async function () {
    console.log('TODO');
  });
  it("Test the shareholders vote share", async function () {
    console.log('TODO');
  });
  it("Test the shareholders vote amount share", async function () {
    console.log('TODO');
  });
  it("Test the contract share cancel before and after fail", async function () {
    console.log('TODO');
  });
  it("Test the contract voting impossible after success", async function () {
    console.log('TODO');
  });
  it("Test the contract voting impossible after share cancelling start", async function () {
    console.log('TODO');
  });
});
