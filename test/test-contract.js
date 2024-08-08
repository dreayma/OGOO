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
    try {
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
      account_shareholder.sendTransaction({to:offer.target, value:0n}).should.eventually.rejectedWith('reverted');
      account_shareholder.sendTransaction({to:offer.target, value:20000000000000001n}).should.eventually.rejectedWith('reverted');

      // test the shareholder created an account sending there enough amount
      await (await account_shareholder.sendTransaction({to:offer.target, value:30000000000000001n})).wait();

      var end_balance_shareholder = await account_shareholder.provider.getBalance(account_shareholder.address);
      var diff = start_balance_shareholder - end_balance_shareholder;
      console.debug("Shareholder account after creating share:", end_balance_shareholder, "Diff WEI:", diff, "Amount $:", to$(diff));

      end_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account after creating share:", end_balance_offer);

      // test the shareholder can increase the balance
      await (await account_shareholder.sendTransaction({to:offer.target, value:10000000000000001n})).wait();

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
      await (await o.observer_create(account_outside.address)).wait();
      console.log("Registered observer address to cancel:", account_outside.address);

      await (await o.observer_create(account_observer.address)).wait();
      console.log("Registered observer address to work with:", account_observer.address);

      // test observer's removing
      await (await o.observer_remove(account_outside.address)).wait();

      // test removing absent observer
      o.observer_remove(account_outside.address).should.eventually.rejectedWith('reverted');

      // Approve the contract to make it unmutable
      await (await o.approve()).wait();

      // Trying to modify observers list should be failed
      o.interface.parseError((await o.observer_create(account_outside.address).should.eventually.rejectedWith('reverted')).data).name.should.be.equal('PreparedOnly');
      o.interface.parseError((await o.observer_remove(account_outside.address).should.eventually.rejectedWith('reverted')).data).name.should.be.equal('PreparedOnly');

      // voting process
      var state = await contractor_access.state();
      console.log('State before first vote', state);
      state.should.be.equal(1n);
      await (await shareholder_access.share_vote(account_contractor.address)).wait();
      o.interface.parseError((await contractor_access.calculate_voting().should.eventually.rejectedWith('reverted')).data).name.should.be.equal('NoWinnerObservers');
      state = await contractor_access.state();
      console.log('State after shareholder vote', state)
      state.should.be.equal(1n);

      var start_balance_contractor = await account_contractor.provider.getBalance(account_contractor.address);
      console.debug("Contractor account before contract success:", start_balance_contractor);
      await (await observer_access.observer_vote(account_contractor.address)).wait();
      await (await contractor_access.calculate_voting()).wait();
      state = await contractor_access.state();
      console.log('State after observer vote', state);
      state.should.be.equal(2n);
      var final_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account after contract completion", final_balance_offer);
      final_balance_offer.should.be.equal(0n);

      var end_balance_contractor = await account_contractor.provider.getBalance(account_contractor.address);
      console.debug("Contractor account after contract success:", end_balance_contractor);
      console.debug("Contractor account diff after contract success ($):", to$(end_balance_contractor - start_balance_contractor));
    } catch(e) {
      if( e.data ) {
        console.error("Unexpected revert", o.interface.parseError(e.data));
      }
      throw e;
    }
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
    try {
      expect(owner).to.equal(account_owner.address);
      await new Promise(resolve => setTimeout(resolve, 1000));

      var start_balance_shareholder = await account_shareholder.provider.getBalance(account_shareholder.address);
      console.debug("Shareholder account before creating share:", start_balance_shareholder);
      var start_balance_shareholder2 = await account_shareholder2.provider.getBalance(account_shareholder2.address);
      console.debug("Shareholder2 account before creating share:", start_balance_shareholder2);

      var start_balance_owner = await account_owner.provider.getBalance(account_owner.address);
      console.debug("Owner account before creating share:", start_balance_owner);

      var start_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account before creating share:", start_balance_offer);

      // test the shareholder created an account sending there enough amount
      await (await account_shareholder.sendTransaction({to:offer.target, value: 30000000000000001n})).wait();
      await (await account_shareholder2.sendTransaction({to:offer.target, value: 30000000000000001n})).wait();
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
      await (await o.approve()).wait();

      // Trying to modify observers list should be failed
      o.interface.parseError((await o.observer_create(account_outside.address).should.eventually.rejectedWith('reverted')).data).name.should.be.equal('PreparedOnly');
      o.interface.parseError((await o.observer_remove(account_outside.address).should.eventually.rejectedWith('reverted')).data).name.should.be.equal('PreparedOnly');

      // voting process
      var state = await contractor_access.state();
      console.log('State before first vote', state);
      state.should.be.equal(1n);

      var start_balance_contractor = await account_contractor.provider.getBalance(account_contractor.address);
      console.debug("Contractor account before contract success:", start_balance_contractor);

      await (await shareholder_access.share_vote(account_contractor.address)).wait();
      console.debug("Shareholder has just voted");
      await (await shareholder2_access.share_vote(account_contractor.address)).wait();
      console.debug("Shareholder2 has just voted");
      await (await contractor_access.calculate_voting()).wait();
      console.debug("Voting has just recalculated");
      state = await contractor_access.state();
      console.log('State after shareholders vote', state)
      state.should.be.equal(2n);

      var final_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account after contract completion", final_balance_offer);
      final_balance_offer.should.be.equal(0n);

      var end_balance_contractor = await account_contractor.provider.getBalance(account_contractor.address);
      console.debug("Contractor account after contract success:", end_balance_contractor);
      console.debug("Contractor account diff after contract success ($):", to$(end_balance_contractor - start_balance_contractor));
    } catch(e) {
      if( e.data ) {
        console.error("Unexpected revert", o.interface.parseError(e.data));
      }
      throw e;
    }
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
    try {
      expect(owner).to.equal(account_owner.address);
      var start_balance_shareholder = await account_shareholder.provider.getBalance(account_shareholder.address);
      console.debug("Shareholder account before creating share:", start_balance_shareholder);
      var start_balance_shareholder2 = await account_shareholder2.provider.getBalance(account_shareholder2.address);
      console.debug("Shareholder2 account before creating share:", start_balance_shareholder2);

      var start_balance_owner = await account_owner.provider.getBalance(account_owner.address);
      console.debug("Owner account before creating share:", start_balance_owner);

      var start_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account before creating share:", start_balance_offer);

      // test the shareholder created an account sending there enough amount
      await (await account_shareholder.sendTransaction({to: offer.target, value: 30000000000000001n})).wait();
      await (await account_shareholder2.sendTransaction({to:offer.target, value: 30000000000000001n})).wait();
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
      await (await o.approve()).wait();

      // voting process
      var state = await contractor_access.state();
      console.log('State before first vote', state);
      state.should.be.equal(1n);

      var start_balance_contractor = await account_contractor.provider.getBalance(account_contractor.address);
      console.debug("Contractor account before contract success:", start_balance_contractor);

      await(await shareholder_access.share_vote(account_contractor.address)).wait();
      console.debug("Shareholder has just voted");
      await (await shareholder2_access.share_cancel()).wait();
      console.debug("Shareholder2 has just cancelled share");
      {
        var time_to_cancel = await shareholder2_access.share_can_be_canceled(account_shareholder2.address);
        console.log("Shareholder2 time to cancel", time_to_cancel);
      }
      await (await contractor_access.calculate_voting()).wait();
      console.debug("Voting has just recalculated");
      state = await contractor_access.state();
      console.log('State after shareholders vote', state)
      state.should.be.equal(2n);

      var final_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account after contract completion", final_balance_offer);
      final_balance_offer.should.be.equal(0n);

      var end_balance_contractor = await account_contractor.provider.getBalance(account_contractor.address);
      console.debug("Contractor account after contract success:", end_balance_contractor);
      console.debug("Contractor account diff after contract success ($):", to$(end_balance_contractor - start_balance_contractor));
    } catch(e) {
      if( e.data ) {
        console.error("Unexpected revert", o.interface.parseError(e.data));
      }
      throw e;
    }
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
    try {
      expect(owner).to.equal(account_owner.address);
      await new Promise(resolve => setTimeout(resolve, 1000));

      var start_balance_shareholder = await account_shareholder.provider.getBalance(account_shareholder.address);
      console.debug("Shareholder account before creating share:", start_balance_shareholder);
      var start_balance_shareholder2 = await account_shareholder2.provider.getBalance(account_shareholder2.address);
      console.debug("Shareholder2 account before creating share:", start_balance_shareholder2);

      var start_balance_owner = await account_owner.provider.getBalance(account_owner.address);
      console.debug("Owner account before creating share:", start_balance_owner);

      var start_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account before creating share:", start_balance_offer);

      // test the shareholder created an account sending there enough amount
      await (await account_shareholder.sendTransaction({to:offer.target, value:30000000000000001n})).wait();
      await (await account_shareholder2.sendTransaction({to:offer.target, value:30000000000000001n})).wait();
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
      await (await o.approve()).wait();

      // voting process
      var state = await contractor_access.state();
      console.log('State before first vote', state);
      state.should.be.equal(1n);

      var start_balance_contractor = await account_contractor.provider.getBalance(account_contractor.address);
      console.debug("Contractor account before contract success:", start_balance_contractor);
      await (await shareholder_access.share_vote(account_contractor.address)).wait();
      console.debug("Shareholder has just voted");
      await (await shareholder2_access.share_cancel()).wait();
      console.debug("Shareholder2 has just cancelled share");
      while(42) {
        var time_to_cancel = await shareholder2_access.share_can_be_canceled(account_shareholder2.address);
        if( !time_to_cancel )
          break;
        console.log("Shareholder2 time to cancel", time_to_cancel);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      await (await shareholder2_access.share_cancel()).wait();
      {
        var interm_balance_offer = await account_owner.provider.getBalance(offer.target);
        console.debug("Offer account after cancel share", interm_balance_offer);
        interm_balance_offer.should.be.equal(30000000000000001n);
      }
      console.debug("Shareholder2 has just successfully cancelled share");
      await (await contractor_access.calculate_voting()).wait();
      console.debug("Voting has just recalculated");
      state = await contractor_access.state();
      console.log('State after shareholders vote', state)
      state.should.be.equal(2n);

      var final_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account after contract completion", final_balance_offer);
      final_balance_offer.should.be.equal(0n);

      var end_balance_contractor = await account_contractor.provider.getBalance(account_contractor.address);
      console.debug("Contractor account after contract success:", end_balance_contractor);
      console.debug("Contractor account diff after contract success ($):", to$(end_balance_contractor - start_balance_contractor));
    } catch(e) {
      if( e.data ) {
        console.error("Unexpected revert", o.interface.parseError(e.data));
      }
      throw e;
    }
  });
  it("Test the voting start balance prevents early contract finishing", async function () {
    console.log("Test the voting start balance prevents early contract finishing");
    var test_definition = {
        "caption": "Test",
        "description": "Test Description",
        "full_details": "Test Details",
        "share_unlock_timeout": 10n,
        "observer_award": 0n,
        "share_min_balance": 10000000000000000n,
        "voting_start_balance": 20000000000000000n,
        "voting_start_count": 0n,
        "voting_start_timeout": 3600n,
        "voting_fail_timeout": 3600n,
        "observers_vote_share": 10000n,
        "shareholders_vote_share": 10000n,
        "shareholders_vote_amount_share": 10000n,
    };
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
    try {
      expect(owner).to.equal(account_owner.address);
      await new Promise(resolve => setTimeout(resolve, 1000));

      var start_balance_shareholder = await account_shareholder.provider.getBalance(account_shareholder.address);
      console.debug("Shareholder account before creating share:", start_balance_shareholder);

      var start_balance_owner = await account_owner.provider.getBalance(account_owner.address);
      console.debug("Owner account before creating share:", start_balance_owner);

      var start_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account before creating share:", start_balance_offer);

      // test the shareholder created an account
      await (await account_shareholder.sendTransaction({to:offer.target, value:10000000000000001n})).wait();
      {
        var end_balance_shareholder = await account_shareholder.provider.getBalance(account_shareholder.address);
        var diff = start_balance_shareholder - end_balance_shareholder;
        console.debug("Shareholder account after creating share:", end_balance_shareholder, "Diff WEI:", diff, "Amount $:", to$(diff));
      }

      end_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account after creating share:", end_balance_offer);

      // Approve the contract to make it unmutable
      await (await o.approve()).wait();

      {
        var state = await contractor_access.state();
        console.log('State before first vote', state);
        state.should.be.equal(1n);
      }
      var start_balance_contractor = await account_contractor.provider.getBalance(account_contractor.address);
      console.debug("Contractor account before contract success:", start_balance_contractor);

      o.interface.parseError((await shareholder_access.share_vote(account_contractor.address).should.eventually.rejectedWith('reverted')).data).name.should.be.equal('ShareBalanceLow');
      {
        var state = await contractor_access.state();
        console.log('State should not be changed', state);
        state.should.be.equal(1n);
      }

      var start_balance_shareholder2 = await account_shareholder2.provider.getBalance(account_shareholder2.address);
      console.debug("Shareholder2 account before creating share:", start_balance_shareholder2);
      await (await account_shareholder2.sendTransaction({to:offer.target, value:30000000000000001n})).wait();
      {
        var end_balance_shareholder2 = await account_shareholder2.provider.getBalance(account_shareholder2.address);
        var diff = start_balance_shareholder2 - end_balance_shareholder2;
        console.debug("Shareholder2 account after creating share:", end_balance_shareholder2, "Diff WEI:", diff, "Amount $:", to$(diff));
      }
      console.debug("Shareholders voting should success now");
      await (await shareholder_access.share_vote(account_contractor.address)).wait();
      await (await shareholder2_access.share_vote(account_contractor.address)).wait();
      console.debug("Shareholders have just voted");
      await (await contractor_access.calculate_voting()).wait();
      console.debug("Voting has just recalculated");
      {
        var state = await contractor_access.state();
        console.log('State after shareholders vote', state)
        state.should.be.equal(2n);
      }
      var final_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account after contract completion", final_balance_offer);
      final_balance_offer.should.be.equal(0n);

      var end_balance_contractor = await account_contractor.provider.getBalance(account_contractor.address);
      console.debug("Contractor account after contract success:", end_balance_contractor);
      console.debug("Contractor account diff after contract success ($):", to$(end_balance_contractor - start_balance_contractor));
    } catch(e) {
      if( e.data ) {
        console.error("Unexpected revert", o.interface.parseError(e.data));
      }
      throw e;
    }
  });
  it("Test the voting start count prevents early contract finishing", async function () {
    console.log("Test the voting start count prevents early contract finishing");
    var test_definition = {
        "caption": "Test",
        "description": "Test Description",
        "full_details": "Test Details",
        "share_unlock_timeout": 10n,
        "observer_award": 0n,
        "share_min_balance": 10000000000000000n,
        "voting_start_balance": 0n,
        "voting_start_count": 2n,
        "voting_start_timeout": 3600n,
        "voting_fail_timeout": 3600n,
        "observers_vote_share": 10000n,
        "shareholders_vote_share": 10000n,
        "shareholders_vote_amount_share": 10000n,
    };
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
    try {
      expect(owner).to.equal(account_owner.address);
      var start_balance_shareholder = await account_shareholder.provider.getBalance(account_shareholder.address);
      console.debug("Shareholder account before creating share:", start_balance_shareholder);

      var start_balance_owner = await account_owner.provider.getBalance(account_owner.address);
      console.debug("Owner account before creating share:", start_balance_owner);

      var start_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account before creating share:", start_balance_offer);

      // test the shareholder created an account
      await (await account_shareholder.sendTransaction({to:offer.target, value:10000000000000001n})).wait();
      {
        var end_balance_shareholder = await account_shareholder.provider.getBalance(account_shareholder.address);
        var diff = start_balance_shareholder - end_balance_shareholder;
        console.debug("Shareholder account after creating share:", end_balance_shareholder, "Diff WEI:", diff, "Amount $:", to$(diff));
      }

      end_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account after creating share:", end_balance_offer);

      // Approve the contract to make it unmutable
      await (await o.approve()).wait();

      {
        var state = await contractor_access.state();
        console.log('State before first vote', state);
        state.should.be.equal(1n);
      }
      var start_balance_contractor = await account_contractor.provider.getBalance(account_contractor.address);
      console.debug("Contractor account before contract success:", start_balance_contractor);

      o.interface.parseError((await shareholder_access.share_vote(account_contractor.address).should.eventually.rejectedWith('reverted')).data).name.should.be.equal('ShareCountLow');
      {
        var state = await contractor_access.state();
        console.log('State should not be changed', state);
        state.should.be.equal(1n);
      }

      var start_balance_shareholder2 = await account_shareholder2.provider.getBalance(account_shareholder2.address);
      console.debug("Shareholder2 account before creating share:", start_balance_shareholder2);
      await (await account_shareholder2.sendTransaction({to:offer.target, value:30000000000000001n})).wait();
      {
        var end_balance_shareholder2 = await account_shareholder2.provider.getBalance(account_shareholder2.address);
        var diff = start_balance_shareholder2 - end_balance_shareholder2;
        console.debug("Shareholder2 account after creating share:", end_balance_shareholder2, "Diff WEI:", diff, "Amount $:", to$(diff));
      }
      console.debug("Shareholders voting should success now");
      await (await shareholder_access.share_vote(account_contractor.address)).wait();
      await (await shareholder2_access.share_vote(account_contractor.address)).wait();
      console.debug("Shareholders have just voted");
      await (await contractor_access.calculate_voting()).wait();
      console.debug("Voting has just recalculated");

      {
        var state = await contractor_access.state();
        console.log('State after shareholders vote', state)
        state.should.be.equal(2n);
      }
      var final_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account after contract completion", final_balance_offer);
      final_balance_offer.should.be.equal(0n);

      var end_balance_contractor = await account_contractor.provider.getBalance(account_contractor.address);
      console.debug("Contractor account after contract success:", end_balance_contractor);
      console.debug("Contractor account diff after contract success ($):", to$(end_balance_contractor - start_balance_contractor));
    } catch(e) {
      if( e.data ) {
        console.error("Unexpected revert", o.interface.parseError(e.data));
      }
      throw e;
    }
  });
  it("Test the voting start timeout fails the offer", async function () {
    console.log("Test the voting start timeout fails the offer");
    var test_definition = {
        "caption": "Test",
        "description": "Test Description",
        "full_details": "Test Details",
        "share_unlock_timeout": 1n,
        "observer_award": 0n,
        "share_min_balance": 10000000000000000n,
        "voting_start_balance": 0n,
        "voting_start_count": 2n,
        "voting_start_timeout": 10n,
        "voting_fail_timeout": 3600n,
        "observers_vote_share": 10000n,
        "shareholders_vote_share": 10000n,
        "shareholders_vote_amount_share": 10000n,
    };
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

    // Getting access from the outside
    var outside_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_outside, // Outside account trying access to the contract
    )

    await o.waitForDeployment();
    var owner = await o.owner();
    try {
      expect(owner).to.equal(account_owner.address);
      var start_balance_shareholder = await account_shareholder.provider.getBalance(account_shareholder.address);
      console.debug("Shareholder account before creating share:", start_balance_shareholder);

      var start_balance_owner = await account_owner.provider.getBalance(account_owner.address);
      console.debug("Owner account before creating share:", start_balance_owner);

      var start_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account before creating share:", start_balance_offer);

      // Approve the contract to make it unmutable
      await (await o.approve()).wait();
      {
        var state = await outside_access.state();
        console.log('State before first vote', state);
        state.should.be.equal(1n);
      }
      // test the shareholder created an account
      await (await account_shareholder.sendTransaction({to:offer.target, value:10000000000000001n})).wait();
      {
        var end_balance_shareholder = await account_shareholder.provider.getBalance(account_shareholder.address);
        var diff = start_balance_shareholder - end_balance_shareholder;
        console.debug("Shareholder account after creating share:", end_balance_shareholder, "Diff WEI:", diff, "Amount $:", to$(diff));
      }

      end_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account after creating share:", end_balance_offer);

      console.debug("Waiting for the voting start timeout");
      await new Promise(resolve => setTimeout(resolve, 10000));
      await (await outside_access.calculate_voting()).wait();
      console.debug("Voting has just been recalculated");
      {
        var state = await outside_access.state();
        console.log('State after voting calculation should be failed', state)
        state.should.be.equal(3n);
      }
      var final_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account after contract failure, share has not been reverted yet", final_balance_offer);
      final_balance_offer.should.be.equal(10000000000000001n);

      console.log('Shareholder may revert the share immediately');
      await (await shareholder_access.share_cancel()).wait();
      {
        var end_balance_shareholder = await account_shareholder.provider.getBalance(account_shareholder.address);
        var diff = start_balance_shareholder - end_balance_shareholder;
        console.debug("Shareholder's account after reverting share:", end_balance_shareholder, "Diff WEI:", diff, "Amount $:", to$(diff));
      }
    } catch(e) {
      if( e.data ) {
        console.error("Unexpected revert", o.interface.parseError(e.data));
      }
      throw e;
    }
  });
  it("Test the voting for failure", async function () {
    console.log("Test the voting for failure");
    var accounts = await hre.ethers.getSigners();
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
    try {
      expect(owner).to.equal(account_owner.address);
      // test updating the definition

      var start_balance_shareholder = await account_shareholder.provider.getBalance(account_shareholder.address);
      console.debug("Shareholder account before creating share:", start_balance_shareholder);

      var start_balance_owner = await account_owner.provider.getBalance(account_owner.address);
      console.debug("Owner account before creating share:", start_balance_owner);

      var start_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account before creating share:", start_balance_offer);

      // test the shareholder created an account sending there enough amount
      await (await account_shareholder.sendTransaction({to:offer.target, value:30000000000000001n})).wait();

      var end_balance_shareholder = await account_shareholder.provider.getBalance(account_shareholder.address);
      var diff = start_balance_shareholder - end_balance_shareholder;
      console.debug("Shareholder account after creating share:", end_balance_shareholder, "Diff WEI:", diff, "Amount $:", to$(diff));

      end_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account after creating share:", end_balance_offer);

      await (await o.observer_create(account_observer.address)).wait();
      console.log("Registered observer address to work with:", account_observer.address);

      // Approve the contract to make it unmutable
      await (await o.approve()).wait();

      // voting process
      var state = await contractor_access.state();
      console.log('State before first vote', state);
      state.should.be.equal(1n);
      await (await shareholder_access.share_vote_failure()).wait();
      o.interface.parseError((await contractor_access.calculate_voting().should.eventually.rejectedWith('reverted')).data).name.should.be.equal('NoWinnerObservers');
      state = await contractor_access.state();
      console.log('State after shareholder vote', state)
      state.should.be.equal(1n);
      await (await observer_access.observer_vote_failure()).wait();
      await (await contractor_access.calculate_voting()).wait();
      state = await contractor_access.state();
      console.log("State after observer's vote should be failed", state);
      state.should.be.equal(3n);
      var final_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account after contract failure", final_balance_offer);
      final_balance_offer.should.be.equal(30000000000000001n);
      console.log('Shareholder may revert the share immediately');
      await (await shareholder_access.share_cancel()).wait();
      {
        var end_balance_shareholder = await account_shareholder.provider.getBalance(account_shareholder.address);
        var diff = start_balance_shareholder - end_balance_shareholder;
        console.debug("Shareholder's account after reverting share:", end_balance_shareholder, "Diff WEI:", diff, "Amount $:", to$(diff));
      }
    } catch(e) {
      if( e.data ) {
        console.error("Unexpected revert", o.interface.parseError(e.data));
      }
      throw e;
    }
  });
  it("Test the voting fail timeout", async function () {
    console.log("Test the voting fail timeout");
    var test_definition = {
        "caption": "Test",
        "description": "Test Description",
        "full_details": "Test Details",
        "share_unlock_timeout": 1n,
        "observer_award": 0n,
        "share_min_balance": 10000000000000000n,
        "voting_start_balance": 0n,
        "voting_start_count": 0n,
        "voting_start_timeout": 3600n,
        "voting_fail_timeout": 20n,
        "observers_vote_share": 10000n,
        "shareholders_vote_share": 10000n,
        "shareholders_vote_amount_share": 10000n,
    };
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

    // Getting access from the outside
    var outside_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_outside, // Outside account trying access to the contract
    )

    await o.waitForDeployment();
    var owner = await o.owner();
    try {
      expect(owner).to.equal(account_owner.address);

      var start_balance_owner = await account_owner.provider.getBalance(account_owner.address);
      console.debug("Owner account before creating share:", start_balance_owner);

      var start_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account before creating share:", start_balance_offer);

      // Approve the contract to make it unmutable
      await (await o.approve()).wait();

      {
        var state = await outside_access.state();
        console.log('State before first vote', state);
        state.should.be.equal(1n);
      }
      // test the shareholder created an account
      var start_balance_shareholder = await account_shareholder.provider.getBalance(account_shareholder.address);
      console.debug("Shareholder account before creating share:", start_balance_shareholder);
      {
        await (await account_shareholder.sendTransaction({to:offer.target, value:10000000000000001n})).wait();

        var end_balance_shareholder = await account_shareholder.provider.getBalance(account_shareholder.address);
        var diff = start_balance_shareholder - end_balance_shareholder;
        console.debug("Shareholder account after creating share:", end_balance_shareholder, "Diff WEI:", diff, "Amount $:", to$(diff));
      }
      var start_balance_shareholder2 = await account_shareholder2.provider.getBalance(account_shareholder2.address);
      console.debug("Shareholder2 account before creating share:", start_balance_shareholder2);
      {
        await (await account_shareholder2.sendTransaction({to:offer.target, value:20000000000000002n})).wait();

        var end_balance_shareholder = await account_shareholder2.provider.getBalance(account_shareholder2.address);
        var diff = start_balance_shareholder2 - end_balance_shareholder;
        console.debug("Shareholder2 account after creating share:", end_balance_shareholder, "Diff WEI:", diff, "Amount $:", to$(diff));
      }

      end_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account after creating share:", end_balance_offer);

      await (await shareholder_access.share_vote(account_contractor.address)).wait();
      console.debug("Shareholder has just voted");
      o.interface.parseError((await outside_access.calculate_voting().should.eventually.rejectedWith('reverted')).data).name.should.be.equal('NoWinnerShares');
      var approved_at = await outside_access.approved_at();
      var failure_at = new Date().getTime() / 1000 - Number(approved_at);
      console.debug("Waiting for the voting failure timeout:", failure_at);
      await new Promise(resolve => setTimeout(resolve, 1000 * failure_at));
      await (await outside_access.calculate_voting()).wait();
      console.debug("Voting has just been recalculated");
      {
        var state = await outside_access.state();
        console.log('State after voting calculation should be failed', state)
        state.should.be.equal(3n);
      }
      var final_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account after contract failure, share has not been reverted yet", final_balance_offer);
      final_balance_offer.should.be.equal(30000000000000003n);

      console.log('Shareholders may revert the share immediately');
      await (await shareholder_access.share_cancel()).wait();
      await (await shareholder2_access.share_cancel()).wait();
      {
        var end_balance_shareholder = await account_shareholder.provider.getBalance(account_shareholder.address);
        var diff = start_balance_shareholder - end_balance_shareholder;
        console.debug("Shareholder's account after reverting share:", end_balance_shareholder, "Diff WEI:", diff, "Amount $:", to$(diff));
      }
      {
        var end_balance_shareholder = await account_shareholder2.provider.getBalance(account_shareholder2.address);
        var diff = start_balance_shareholder2 - end_balance_shareholder;
        console.debug("Shareholder's 2 account after reverting share:", end_balance_shareholder, "Diff WEI:", diff, "Amount $:", to$(diff));
      }
    } catch(e) {
      if( e.data ) {
        console.error("Unexpected revert", o.interface.parseError(e.data));
      }
      throw e;
    }
  });
  it("Test the shareholders vote share", async function () {
    console.log("Test the shareholders vote share");
    var test_definition = {
        "caption": "Test",
        "description": "Test Description",
        "full_details": "Test Details",
        "share_unlock_timeout": 1n,
        "observer_award": 0n,
        "share_min_balance": 10000000000000000n,
        "voting_start_balance": 0n,
        "voting_start_count": 0n,
        "voting_start_timeout": 3600n,
        "voting_fail_timeout": 3600n,
        "observers_vote_share": 10000n,
        "shareholders_vote_share": 6000n,
        "shareholders_vote_amount_share": 0n,
    };
    var accounts = await hre.ethers.getSigners();
    var account_owner = accounts[0]; // the first account will be a signer to check an access from the owner
    var Offer = await ethers.getContractFactory("Offer", account_owner);
    // Start deployment, returning a promise that resolves to a contract object
    var offer = await Offer.deploy(test_definition);
    console.info("Waiting for deployment...");
    await offer.waitForDeployment();
    var owner = await offer.owner();
    console.info("Contract deployed to address:", offer.target);
    console.info("Contract owner is:", owner);
    expect(owner).to.equal(account_owner.address);

    var account_shareholder1 = accounts[1]; // the account will be a signer to check an access from the shareholder
    var account_shareholder2 = accounts[2]; // the account will be a signer to check an access from the shareholder
    var account_shareholder3 = accounts[3]; // the account will be a signer to check an access from the shareholder
    var account_contractor = accounts[4]; // the account will be a signer to check an access from the contractor
    var contract_abi = require("../artifacts/contracts/ogoo.sol/Offer.json");

    // Gettings access from the owner
    var o = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_owner, // Signer to get access to the contract
    )

    // Getting access from the shareholder
    var shareholder1_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_shareholder1, // Shareholder account trying access to the contract
    )
    var shareholder2_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_shareholder2, // Shareholder account trying access to the contract
    )
    var shareholder3_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_shareholder3, // Shareholder account trying access to the contract
    )

    // Getting access from the contractor
    var contractor_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_contractor, // Contractor account trying access to the contract
    )
    try {
      // Approve the contract to make it unmutable
      await (await o.approve()).wait();

      // test the shareholder created an account sending there enough amount
      await (await account_shareholder1.sendTransaction({to:offer.target, value: 10000000000000001n})).wait();
      await (await account_shareholder2.sendTransaction({to:offer.target, value: 20000000000000001n})).wait();
      await (await account_shareholder3.sendTransaction({to:offer.target, value: 30000000000000003n})).wait();
      (await shareholder1_access.share_get_for_origin()).should.be.equal(10000000000000001n);
      (await shareholder2_access.share_get_for_origin()).should.be.equal(20000000000000001n);
      (await shareholder3_access.share_get_for_origin()).should.be.equal(30000000000000003n);

      // voting process
      var state = await contractor_access.state();
      console.log('State before first vote', state);
      state.should.be.equal(1n);

      var start_balance_contractor = await account_contractor.provider.getBalance(account_contractor.address);
      console.debug("Contractor account before contract success:", start_balance_contractor);
      await (await shareholder3_access.share_vote(account_contractor.address)).wait();
      console.debug("The most valuable shareholder has just voted");
      o.interface.parseError((await contractor_access.calculate_voting().should.eventually.rejectedWith('reverted')).data).name.should.be.equal('NoWinnerShares');
      console.debug("Voting has just been recalculated");
      state = await contractor_access.state();
      console.log('State after shareholders vote', state)
      state.should.be.equal(1n);
      await (await shareholder1_access.share_vote(account_contractor.address)).wait();
      console.debug("The least valuable shareholder has just voted");
      await (await contractor_access.calculate_voting()).wait();
      console.debug("Voting has just been recalculated");
      state = await contractor_access.state();
      console.log('State after shareholders vote', state)
      state.should.be.equal(2n);

      var final_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account after contract completion", final_balance_offer);
      final_balance_offer.should.be.equal(0n);

      var end_balance_contractor = await account_contractor.provider.getBalance(account_contractor.address);
      console.debug("Contractor account after contract success:", end_balance_contractor);
      console.debug("Contractor account diff after contract success ($):", to$(end_balance_contractor - start_balance_contractor));
    } catch(e) {
      if( e.data ) {
        console.error("Unexpected revert", o.interface.parseError(e.data));
      }
      throw e;
    }
  });
  it("Test the shareholders vote amount share", async function () {
    console.log("Test the shareholders vote amount share");
    var test_definition = {
        "caption": "Test",
        "description": "Test Description",
        "full_details": "Test Details",
        "share_unlock_timeout": 1n,
        "observer_award": 0n,
        "share_min_balance": 10000000000000000n,
        "voting_start_balance": 0n,
        "voting_start_count": 0n,
        "voting_start_timeout": 3600n,
        "voting_fail_timeout": 3600n,
        "observers_vote_share": 10000n,
        "shareholders_vote_share": 0n,
        "shareholders_vote_amount_share": 5000n,
    };
    var accounts = await hre.ethers.getSigners();
    var account_owner = accounts[0]; // the first account will be a signer to check an access from the owner
    var Offer = await ethers.getContractFactory("Offer", account_owner);
    // Start deployment, returning a promise that resolves to a contract object
    var offer = await Offer.deploy(test_definition);
    console.info("Waiting for deployment...");
    await offer.waitForDeployment();
    var owner = await offer.owner();
    console.info("Contract deployed to address:", offer.target);
    console.info("Contract owner is:", owner);
    expect(owner).to.equal(account_owner.address);

    var account_shareholder1 = accounts[1]; // the account will be a signer to check an access from the shareholder
    var account_shareholder2 = accounts[2]; // the account will be a signer to check an access from the shareholder
    var account_shareholder3 = accounts[3]; // the account will be a signer to check an access from the shareholder
    var account_contractor = accounts[4]; // the account will be a signer to check an access from the contractor
    var contract_abi = require("../artifacts/contracts/ogoo.sol/Offer.json");

    // Gettings access from the owner
    var o = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_owner, // Signer to get access to the contract
    )

    // Getting access from the shareholder
    var shareholder1_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_shareholder1, // Shareholder account trying access to the contract
    )
    var shareholder2_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_shareholder2, // Shareholder account trying access to the contract
    )
    var shareholder3_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_shareholder3, // Shareholder account trying access to the contract
    )

    // Getting access from the contractor
    var contractor_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_contractor, // Contractor account trying access to the contract
    )
    try {
      // Approve the contract to make it unmutable
      await (await o.approve()).wait();

      // test the shareholder created an account sending there enough amount
      await (await account_shareholder1.sendTransaction({to:offer.target, value: 10000000000000001n})).wait();
      await (await account_shareholder2.sendTransaction({to:offer.target, value: 20000000000000001n})).wait();
      await (await account_shareholder3.sendTransaction({to:offer.target, value: 30000000000000003n})).wait();
      (await shareholder1_access.share_get_for_origin()).should.be.equal(10000000000000001n);
      (await shareholder2_access.share_get_for_origin()).should.be.equal(20000000000000001n);
      (await shareholder3_access.share_get_for_origin()).should.be.equal(30000000000000003n);

      // voting process
      var state = await contractor_access.state();
      console.log('State before first vote', state);
      state.should.be.equal(1n);

      var start_balance_contractor = await account_contractor.provider.getBalance(account_contractor.address);
      console.debug("Contractor account before contract success:", start_balance_contractor);
      await (await shareholder3_access.share_vote(account_contractor.address)).wait();
      console.debug("The most valuable shareholder has just voted");
      await (await contractor_access.calculate_voting()).wait();
      console.debug("Voting has just been recalculated");
      state = await contractor_access.state();
      console.log('State after shareholders vote', state)
      state.should.be.equal(2n);

      var final_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account after contract completion", final_balance_offer);
      final_balance_offer.should.be.equal(0n);

      var end_balance_contractor = await account_contractor.provider.getBalance(account_contractor.address);
      console.debug("Contractor account after contract success:", end_balance_contractor);
      console.debug("Contractor account diff after contract success ($):", to$(end_balance_contractor - start_balance_contractor));
    } catch(e) {
      if( e.data ) {
        console.error("Unexpected revert", o.interface.parseError(e.data));
      }
      throw e;
    }
  });
  it("Test the observers vote share", async function () {
    console.log("Test the observers vote share");
    var test_definition = {
        "caption": "Test",
        "description": "Test Description",
        "full_details": "Test Details",
        "share_unlock_timeout": 1n,
        "observer_award": 0n,
        "share_min_balance": 10000000000000000n,
        "voting_start_balance": 0n,
        "voting_start_count": 0n,
        "voting_start_timeout": 3600n,
        "voting_fail_timeout": 3600n,
        "observers_vote_share": 6000n,
        "shareholders_vote_share": 0n,
        "shareholders_vote_amount_share": 0n,
    };
    var accounts = await hre.ethers.getSigners();
    var account_owner = accounts[0]; // the first account will be a signer to check an access from the owner
    var Offer = await ethers.getContractFactory("Offer", account_owner);
    // Start deployment, returning a promise that resolves to a contract object
    var offer = await Offer.deploy(test_definition);
    console.info("Waiting for deployment...");
    await offer.waitForDeployment();
    var owner = await offer.owner();
    console.info("Contract deployed to address:", offer.target);
    console.info("Contract owner is:", owner);
    expect(owner).to.equal(account_owner.address);

    var account_shareholder1 = accounts[1]; // the account will be a signer to check an access from the shareholder
    var account_shareholder2 = accounts[2]; // the account will be a signer to check an access from the shareholder
    var account_shareholder3 = accounts[3]; // the account will be a signer to check an access from the shareholder
    var account_contractor = accounts[4]; // the account will be a signer to check an access from the contractor
    var contract_abi = require("../artifacts/contracts/ogoo.sol/Offer.json");

    // Gettings access from the owner
    var o = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_owner, // Signer to get access to the contract
    )

    // Getting access from the shareholder
    var shareholder1_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_shareholder1, // Shareholder account trying access to the contract
    )
    var shareholder2_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_shareholder2, // Shareholder account trying access to the contract
    )
    var shareholder3_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_shareholder3, // Shareholder account trying access to the contract
    )

    // Getting access from the contractor
    var contractor_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_contractor, // Contractor account trying access to the contract
    )
    try {
      // Shareholders also will be observers
      await (await o.observer_create(account_shareholder1.address)).wait();
      await (await o.observer_create(account_shareholder2.address)).wait();
      await (await o.observer_create(account_shareholder3.address)).wait();

      // Approve the contract to make it unmutable
      await (await o.approve()).wait();

      // test the shareholder created an account sending there enough amount
      await (await account_shareholder1.sendTransaction({to:offer.target, value: 10000000000000001n})).wait();
      await (await account_shareholder2.sendTransaction({to:offer.target, value: 20000000000000001n})).wait();
      await (await account_shareholder3.sendTransaction({to:offer.target, value: 30000000000000003n})).wait();
      (await shareholder1_access.share_get_for_origin()).should.be.equal(10000000000000001n);
      (await shareholder2_access.share_get_for_origin()).should.be.equal(20000000000000001n);
      (await shareholder3_access.share_get_for_origin()).should.be.equal(30000000000000003n);

      // voting process
      var state = await contractor_access.state();
      console.log('State before first vote', state);
      state.should.be.equal(1n);

      var start_balance_contractor = await account_contractor.provider.getBalance(account_contractor.address);
      console.debug("Contractor account before contract success:", start_balance_contractor);
      await (await shareholder3_access.share_vote(account_contractor.address)).wait();
      console.debug("The most valuable shareholder has just voted");
      o.interface.parseError((await contractor_access.calculate_voting().should.eventually.rejectedWith('reverted')).data).name.should.be.equal('NoWinnerObservers');
      console.debug("Voting has just been recalculated");
      state = await contractor_access.state();
      console.log('State after shareholders vote', state)
      state.should.be.equal(1n);
      await (await shareholder1_access.observer_vote(account_contractor.address)).wait();
      console.debug("The observer has just voted");
      o.interface.parseError((await contractor_access.calculate_voting().should.eventually.rejectedWith('reverted')).data).name.should.be.equal('NoWinnerObservers');
      console.debug("Voting has just been recalculated");
      state = await contractor_access.state();
      console.log('State after observers vote', state)
      state.should.be.equal(1n);
      await (await shareholder2_access.observer_vote(account_contractor.address)).wait();
      console.debug("The other observer has just voted");
      await (await contractor_access.calculate_voting()).wait();
      console.debug("Voting has just been recalculated");
      state = await contractor_access.state();
      console.log('State after another observers vote', state)
      state.should.be.equal(2n);

      var final_balance_offer = await account_owner.provider.getBalance(offer.target);
      console.debug("Offer account after contract completion", final_balance_offer);
      final_balance_offer.should.be.equal(0n);

      var end_balance_contractor = await account_contractor.provider.getBalance(account_contractor.address);
      console.debug("Contractor account after contract success:", end_balance_contractor);
      console.debug("Contractor account diff after contract success ($):", to$(end_balance_contractor - start_balance_contractor));
    } catch(e) {
      if( e.data ) {
        console.error("Unexpected revert", o.interface.parseError(e.data));
      }
      throw e;
    }
  });
  it("Test the voting conflict", async function () {
    console.log("Test the voting conflict");
    var test_definition = {
        "caption": "Test",
        "description": "Test Description",
        "full_details": "Test Details",
        "share_unlock_timeout": 1n,
        "observer_award": 0n,
        "share_min_balance": 10000000000000000n,
        "voting_start_balance": 0n,
        "voting_start_count": 0n,
        "voting_start_timeout": 3600n,
        "voting_fail_timeout": 3600n,
        "observers_vote_share": 3000n,
        "shareholders_vote_share": 3000n,
        "shareholders_vote_amount_share": 3000n,
    };
    var accounts = await hre.ethers.getSigners();
    var account_owner = accounts[0]; // the first account will be a signer to check an access from the owner
    var Offer = await ethers.getContractFactory("Offer", account_owner);
    // Start deployment, returning a promise that resolves to a contract object
    var offer = await Offer.deploy(test_definition);
    console.info("Waiting for deployment...");
    await offer.waitForDeployment();
    var owner = await offer.owner();
    console.info("Contract deployed to address:", offer.target);
    console.info("Contract owner is:", owner);
    expect(owner).to.equal(account_owner.address);

    var account_shareholder1 = accounts[1]; // the account will be a signer to check an access from the shareholder
    var account_shareholder2 = accounts[2]; // the account will be a signer to check an access from the shareholder
    var account_shareholder3 = accounts[3]; // the account will be a signer to check an access from the shareholder
    var account_contractor = accounts[4]; // the account will be a signer to check an access from the contractor
    var contract_abi = require("../artifacts/contracts/ogoo.sol/Offer.json");

    // Gettings access from the owner
    var o = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_owner, // Signer to get access to the contract
    )

    // Getting access from the shareholder
    var shareholder1_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_shareholder1, // Shareholder account trying access to the contract
    )
    var shareholder2_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_shareholder2, // Shareholder account trying access to the contract
    )
    var shareholder3_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_shareholder3, // Shareholder account trying access to the contract
    )

    // Getting access from the contractor
    var contractor_access = new ethers.Contract(
      offer.target,
      contract_abi.abi,
      account_contractor, // Contractor account trying access to the contract
    )
    try {
      // Let's the contractor is observer
      await (await o.observer_create(account_contractor.address)).wait();

      // Approve the contract to make it unmutable
      await (await o.approve()).wait();

      // test the shareholder created an account sending there enough amount
      await (await account_shareholder1.sendTransaction({to:offer.target, value: 10000000000000001n})).wait();
      await (await account_shareholder2.sendTransaction({to:offer.target, value: 20000000000000001n})).wait();
      await (await account_shareholder3.sendTransaction({to:offer.target, value: 30000000000000003n})).wait();
      (await shareholder1_access.share_get_for_origin()).should.be.equal(10000000000000001n);
      (await shareholder2_access.share_get_for_origin()).should.be.equal(20000000000000001n);
      (await shareholder3_access.share_get_for_origin()).should.be.equal(30000000000000003n);

      // voting process
      var state = await contractor_access.state();
      console.log('State before first vote', state);
      state.should.be.equal(1n);

      var start_balance_contractor = await account_contractor.provider.getBalance(account_contractor.address);
      console.debug("Contractor account before contract success:", start_balance_contractor);

      await (await shareholder3_access.share_vote(account_shareholder3.address)).wait();
      console.debug("The most valuable shareholder has just voted for himself");
      await (await shareholder1_access.share_vote(account_shareholder1.address)).wait();
      await (await shareholder2_access.share_vote(account_shareholder1.address)).wait();
      console.debug("The least valuable shareholders has just voted for shareholder1");
      o.interface.parseError((await contractor_access.calculate_voting().should.eventually.rejectedWith('reverted')).data).name.should.be.equal('NoWinnerObservers');
      state = await contractor_access.state();
      console.log('State after shareholders vote', state)
      state.should.be.equal(1n);

      await (await contractor_access.observer_vote(account_contractor.address)).wait();
      console.debug("The observer/contractor has just voted for himself");

      o.interface.parseError((await contractor_access.calculate_voting().should.eventually.rejectedWith('reverted')).data).name.should.be.equal('VotingConflict');
      state = await contractor_access.state();
      console.log('State after conflict observer vote should not be changed, voting conflict', state)
      state.should.be.equal(1n);
    } catch(e) {
      if( e.data ) {
        console.error("Unexpected revert", o.interface.parseError(e.data));
      }
      throw e;
    }
  });
});
