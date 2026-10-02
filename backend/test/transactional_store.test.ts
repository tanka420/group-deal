import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TransactionalStore } from "../src/db/store";

function runTransactionalStoreTests() {
  console.log("=== Running SQLite Transaction & Uniqueness Tests ===");
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "groupdeal-sqlite-"));
  const store = new TransactionalStore(testDir);
  try {
    store.db.users.a = {
      id: "a",
      email: "same@example.com",
      createdAt: 1,
      roles: ["buyer"],
      activeWallet: "0x1111111111111111111111111111111111111111",
      circleUserId: "circle-a",
    };
    store.save();

    store.db.users.b = {
      id: "b",
      email: "same@example.com",
      createdAt: 2,
      roles: ["buyer"],
      activeWallet: "0x2222222222222222222222222222222222222222",
      circleUserId: "circle-b",
    };
    assert.throws(() => store.save(), /UNIQUE constraint failed/);
    delete store.db.users.b;
    console.log("✔ Duplicate email rejected by a physical SQLite UNIQUE constraint");

    store.db.eventJournal.first = {
      id: "first",
      chainId: 5042002,
      contractAddress: "0x3333333333333333333333333333333333333333",
      blockNumber: 10,
      blockHash: `0x${"11".repeat(32)}`,
      transactionIndex: 0,
      txHash: `0x${"22".repeat(32)}`,
      logIndex: 7,
      eventName: "CommitmentMade",
      payload: {},
      processedAt: 3,
    };
    store.save();
    store.db.eventJournal.alias = { ...store.db.eventJournal.first, id: "alias" };
    assert.throws(() => store.save(), /UNIQUE constraint failed/);
    delete store.db.eventJournal.alias;
    console.log("✔ Duplicate chain/transaction/log identity rejected atomically");

    store.db.circleOperations.op1 = {
      operationId: "op1",
      userId: "a",
      walletId: "wallet-a",
      payloadHash: "hash-a",
      idempotencyKey: "11111111-1111-4111-8111-111111111111",
      createdAt: 4,
    };
    store.save();
    store.db.circleOperations.op2 = {
      ...store.db.circleOperations.op1,
      operationId: "op2",
      payloadHash: "hash-b",
    };
    assert.throws(() => store.save(), /UNIQUE constraint failed/);
    delete store.db.circleOperations.op2;
    console.log("✔ Duplicate Circle idempotency key rejected by SQLite");
  } finally {
    store.close();
    fs.rmSync(testDir, { recursive: true, force: true });
  }
  console.log("All SQLite transaction tests passed!\n");
}

runTransactionalStoreTests();
