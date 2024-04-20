const { expect } = require("chai");
const hre = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("BaseTests", function () {
  it("Test the testing environment works", async function () {
    var f = function test() {
        return 42;
    }
    // assert that the value is correct
    expect(f()).to.equal(42);
  });
});
