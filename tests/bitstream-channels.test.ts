import { describe, expect, it } from "vitest";

const accounts = simnet.getAccounts();
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;
const wallet3 = accounts.get("wallet_3")!;

const channelId = "0x00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
const channelIdBuff = simnet.buffFromHex(channelId);
const initialDeposit = 1000000;
const additionalFunds = 500000;

describe("bitstream-channels", () => {
  describe("create-channel", () => {
    it("should create a new payment channel successfully", () => {
      const { result } = simnet.callPublicFn(
        "bitstream-channels",
        "create-channel",
        [channelIdBuff, wallet2, initialDeposit],
        wallet1
      );
      
      expect(result).toBeOk(true);
      
      // Verify channel state
      const channel = simnet.getMapEntry(
        "bitstream-channels",
        "payment-channels",
        {
          "channel-id": channelIdBuff,
          "participant-a": wallet1,
          "participant-b": wallet2
        }
      );
      
      expect(channel).toBeSome();
      expect(channel.value['balance-a']).toBeUint(initialDeposit);
      expect(channel.value['balance-b']).toBeUint(0);
      expect(channel.value['is-open']).toBeBool(true);
      expect(channel.value['total-deposited']).toBeUint(initialDeposit);
    });

    it("should fail with invalid channel ID", () => {
      const invalidChannelId = simnet.buffFromHex("");
      
      const { result } = simnet.callPublicFn(
        "bitstream-channels",
        "create-channel",
        [invalidChannelId, wallet2, initialDeposit],
        wallet1
      );
      
      expect(result).toBeErr(107); // ERR-INVALID-INPUT
    });

    it("should fail with zero deposit", () => {
      const { result } = simnet.callPublicFn(
        "bitstream-channels",
        "create-channel",
        [channelIdBuff, wallet2, 0],
        wallet1
      );
      
      expect(result).toBeErr(107); // ERR-INVALID-INPUT
    });

    it("should fail when sender is same as participant B", () => {
      const { result } = simnet.callPublicFn(
        "bitstream-channels",
        "create-channel",
        [channelIdBuff, wallet1, initialDeposit],
        wallet1
      );
      
      expect(result).toBeErr(107); // ERR-INVALID-INPUT
    });

    it("should fail when channel already exists", () => {
      // Create first channel
      simnet.callPublicFn(
        "bitstream-channels",
        "create-channel",
        [channelIdBuff, wallet2, initialDeposit],
        wallet1
      );
      
      // Try to create duplicate
      const { result } = simnet.callPublicFn(
        "bitstream-channels",
        "create-channel",
        [channelIdBuff, wallet2, initialDeposit],
        wallet1
      );
      
      expect(result).toBeErr(101); // ERR-CHANNEL-EXISTS
    });

    it("should fail with insufficient funds", () => {
      const { result } = simnet.callPublicFn(
        "bitstream-channels",
        "create-channel",
        [channelIdBuff, wallet2, 1000000000000],
        wallet1
      );
      
      expect(result).toBeErr(103); // ERR-INSUFFICIENT-FUNDS
    });
  });

  describe("fund-channel", () => {
    beforeEach(() => {
      // Create a channel before each funding test
      simnet.callPublicFn(
        "bitstream-channels",
        "create-channel",
        [channelIdBuff, wallet2, initialDeposit],
        wallet1
      );
    });

    it("should fund an existing channel successfully", () => {
      const { result } = simnet.callPublicFn(
        "bitstream-channels",
        "fund-channel",
        [channelIdBuff, wallet2, additionalFunds],
        wallet1
      );
      
      expect(result).toBeOk(true);
      
      const channel = simnet.getMapEntry(
        "bitstream-channels",
        "payment-channels",
        {
          "channel-id": channelIdBuff,
          "participant-a": wallet1,
          "participant-b": wallet2
        }
      );
      
      expect(channel.value['total-deposited']).toBeUint(initialDeposit + additionalFunds);
      expect(channel.value['balance-a']).toBeUint(initialDeposit + additionalFunds);
    });

    it("should fail when channel doesn't exist", () => {
      const nonExistentId = simnet.buffFromHex("ffffffffffffffffffffffffffffffff");
      
      const { result } = simnet.callPublicFn(
        "bitstream-channels",
        "fund-channel",
        [nonExistentId, wallet2, additionalFunds],
        wallet1
      );
      
      expect(result).toBeErr(102); // ERR-CHANNEL-NOT-FOUND
    });

    it("should fail when channel is closed", () => {
      // First close the channel
      const balanceA = initialDeposit;
      const balanceB = 0;
      const dummySignature = simnet.buffFromHex("00".repeat(65));
      
      simnet.callPublicFn(
        "bitstream-channels",
        "close-channel-cooperative",
        [channelIdBuff, wallet2, balanceA, balanceB, dummySignature, dummySignature],
        wallet1
      );
      
      // Try to fund closed channel
      const { result } = simnet.callPublicFn(
        "bitstream-channels",
        "fund-channel",
        [channelIdBuff, wallet2, additionalFunds],
        wallet1
      );
      
      expect(result).toBeErr(105); // ERR-CHANNEL-CLOSED
    });

    it("should fail when non-participant tries to fund", () => {
      const { result } = simnet.callPublicFn(
        "bitstream-channels",
        "fund-channel",
        [channelIdBuff, wallet2, additionalFunds],
        wallet3 // Different wallet trying to fund
      );
      
      expect(result).toBeErr(102); // ERR-CHANNEL-NOT-FOUND
    });
  });

  describe("close-channel-cooperative", () => {
    beforeEach(() => {
      simnet.callPublicFn(
        "bitstream-channels",
        "create-channel",
        [channelIdBuff, wallet2, initialDeposit],
        wallet1
      );
    });

    it("should close channel cooperatively with valid signatures", () => {
      const balanceA = 600000;
      const balanceB = 400000;
      const dummySignature = simnet.buffFromHex("00".repeat(65));
      
      const { result } = simnet.callPublicFn(
        "bitstream-channels",
        "close-channel-cooperative",
        [channelIdBuff, wallet2, balanceA, balanceB, dummySignature, dummySignature],
        wallet1
      );
      
      expect(result).toBeOk(true);
      
      const channel = simnet.getMapEntry(
        "bitstream-channels",
        "payment-channels",
        {
          "channel-id": channelIdBuff,
          "participant-a": wallet1,
          "participant-b": wallet2
        }
      );
      
      expect(channel.value['is-open']).toBeBool(false);
      expect(channel.value['total-deposited']).toBeUint(0);
    });

    it("should fail when balances don't sum to total", () => {
      const balanceA = 600000;
      const balanceB = 300000; // Sum is 900000, but total is 1000000
      const dummySignature = simnet.buffFromHex("00".repeat(65));
      
      const { result } = simnet.callPublicFn(
        "bitstream-channels",
        "close-channel-cooperative",
        [channelIdBuff, wallet2, balanceA, balanceB, dummySignature, dummySignature],
        wallet1
      );
      
      expect(result).toBeErr(103); // ERR-INSUFFICIENT-FUNDS
    });

    it("should fail with invalid signatures", () => {
      const balanceA = 600000;
      const balanceB = 400000;
      const invalidSignature = simnet.buffFromHex("ff".repeat(65));
      
      const { result } = simnet.callPublicFn(
        "bitstream-channels",
        "close-channel-cooperative",
        [channelIdBuff, wallet2, balanceA, balanceB, invalidSignature, invalidSignature],
        wallet1
      );
      
      expect(result).toBeErr(104); // ERR-INVALID-SIGNATURE
    });
  });

  describe("unilateral close", () => {
    beforeEach(() => {
      simnet.callPublicFn(
        "bitstream-channels",
        "create-channel",
        [channelIdBuff, wallet2, initialDeposit],
        wallet1
      );
    });

    it("should initiate unilateral close with valid signature", () => {
      const proposedBalanceA = 600000;
      const proposedBalanceB = 400000;
      const dummySignature = simnet.buffFromHex("00".repeat(65));
      
      const { result } = simnet.callPublicFn(
        "bitstream-channels",
        "initiate-unilateral-close",
        [channelIdBuff, wallet2, proposedBalanceA, proposedBalanceB, dummySignature],
        wallet1
      );
      
      expect(result).toBeOk(true);
      
      const channel = simnet.getMapEntry(
        "bitstream-channels",
        "payment-channels",
        {
          "channel-id": channelIdBuff,
          "participant-a": wallet1,
          "participant-b": wallet2
        }
      );
      
      expect(channel.value['balance-a']).toBeUint(proposedBalanceA);
      expect(channel.value['balance-b']).toBeUint(proposedBalanceB);
      expect(channel.value['dispute-deadline']).toBeUint(simnet.blockHeight + 1008);
    });

    it("should resolve unilateral close after dispute period", () => {
      const proposedBalanceA = 600000;
      const proposedBalanceB = 400000;
      const dummySignature = simnet.buffFromHex("00".repeat(65));
      
      // Initiate close
      simnet.callPublicFn(
        "bitstream-channels",
        "initiate-unilateral-close",
        [channelIdBuff, wallet2, proposedBalanceA, proposedBalanceB, dummySignature],
        wallet1
      );
      
      // Advance blocks past dispute period
      simnet.mineEmptyBlocks(1010);
      
      // Resolve close
      const { result } = simnet.callPublicFn(
        "bitstream-channels",
        "resolve-unilateral-close",
        [channelIdBuff, wallet2],
        wallet1
      );
      
      expect(result).toBeOk(true);
      
      const channel = simnet.getMapEntry(
        "bitstream-channels",
        "payment-channels",
        {
          "channel-id": channelIdBuff,
          "participant-a": wallet1,
          "participant-b": wallet2
        }
      );
      
      expect(channel.value['is-open']).toBeBool(false);
    });

    it("should fail to resolve before dispute period ends", () => {
      const proposedBalanceA = 600000;
      const proposedBalanceB = 400000;
      const dummySignature = simnet.buffFromHex("00".repeat(65));
      
      // Initiate close
      simnet.callPublicFn(
        "bitstream-channels",
        "initiate-unilateral-close",
        [channelIdBuff, wallet2, proposedBalanceA, proposedBalanceB, dummySignature],
        wallet1
      );
      
      // Try to resolve immediately
      const { result } = simnet.callPublicFn(
        "bitstream-channels",
        "resolve-unilateral-close",
        [channelIdBuff, wallet2],
        wallet1
      );
      
      expect(result).toBeErr(106); // ERR-DISPUTE-PERIOD
    });
  });

  describe("emergency-withdraw", () => {
    it("should allow contract owner to withdraw", () => {
      // First create a channel to put funds in contract
      simnet.callPublicFn(
        "bitstream-channels",
        "create-channel",
        [channelIdBuff, wallet2, initialDeposit],
        wallet1
      );
      
      const { result } = simnet.callPublicFn(
        "bitstream-channels",
        "emergency-withdraw",
        [],
        wallet1
      );
      
      expect(result).toBeOk(true);
    });

    it("should not allow non-owner to withdraw", () => {
      const { result } = simnet.callPublicFn(
        "bitstream-channels",
        "emergency-withdraw",
        [],
        wallet2
      );
      
      expect(result).toBeErr(100); // ERR-NOT-AUTHORIZED
    });
  });

  describe("get-channel-info", () => {
    it("should return channel info for existing channel", () => {
      simnet.callPublicFn(
        "bitstream-channels",
        "create-channel",
        [channelIdBuff, wallet2, initialDeposit],
        wallet1
      );
      
      const { result } = simnet.callReadOnlyFn(
        "bitstream-channels",
        "get-channel-info",
        [channelIdBuff, wallet1, wallet2],
        wallet1
      );
      
      expect(result).toBeSome();
    });

    it("should return none for non-existent channel", () => {
      const nonExistentId = simnet.buffFromHex("ffffffffffffffffffffffffffffffff");
      
      const { result } = simnet.callReadOnlyFn(
        "bitstream-channels",
        "get-channel-info",
        [nonExistentId, wallet1, wallet2],
        wallet1
      );
      
      expect(result).toBeNone();
    });
  });
});
