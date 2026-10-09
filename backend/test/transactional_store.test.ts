import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
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
    store.db.campaigns.a = {id:"a",onchainCampaignId:1,chainId:5042002,hubAddress:"0x3333333333333333333333333333333333333333"} as any;
    store.save();
    assert.throws(()=>store.transaction(()=>{store.db.campaigns.b={...store.db.campaigns.a,id:"b"};}),/UNIQUE constraint failed/);
    assert.equal(store.db.campaigns.b,undefined);
    store.db.campaignIdentities.a={accountId:"a",campaignId:"a",identity:"0xidentity",derivationVersion:1,createdAt:1};store.save();
    assert.throws(()=>store.transaction(()=>{store.db.campaignIdentities.b={...store.db.campaignIdentities.a,accountId:"b"};}),/UNIQUE constraint failed/);
    assert.equal(store.db.campaignIdentities.b,undefined);
    console.log("✔ Campaign chain/deployment mapping and identity owner constraints roll back duplicates");

    const observer = new DatabaseSync(path.join(testDir, "groupdeal.sqlite"));
    observer.exec("CREATE TABLE write_probe(collection TEXT); CREATE TRIGGER probe_insert AFTER INSERT ON domain_records BEGIN INSERT INTO write_probe VALUES(new.collection); END; CREATE TRIGGER probe_update AFTER UPDATE ON domain_records BEGIN INSERT INTO write_probe VALUES(new.collection); END;");
    store.db.rateLimits.example = { count:1, resetAt:10 } as any;
    store.save();
    assert.deepEqual(observer.prepare("SELECT collection FROM write_probe").all().map(row => row.collection), ["rateLimits"]);
    observer.close();
    console.log("✔ A one-record mutation writes only that domain row");

    const concurrent = new TransactionalStore(testDir);
    try {
      store.db.rateLimits.winner = { count:2, resetAt:20 } as any;
      store.save();
      assert.throws(() => concurrent.transaction(() => {
        concurrent.db.rateLimits.loser = { count:3, resetAt:30 } as any;
      }), /another process/);
      assert.equal(concurrent.db.rateLimits.winner.count,2);
      assert.equal(concurrent.db.rateLimits.loser,undefined);
      concurrent.transaction(() => { concurrent.db.rateLimits.retry = { count:4, resetAt:40 } as any; });
    } finally { concurrent.close(); }
    const reopened = new TransactionalStore(testDir);
    assert.equal(reopened.db.rateLimits.winner.count,2);
    assert.equal(reopened.db.rateLimits.retry.count,4);
    assert.equal(reopened.db.rateLimits.loser,undefined);
    reopened.close();
    console.log("✔ Independent store instances reject stale writes and reload before retry");
    const legacyWriter = new DatabaseSync(path.join(testDir,"groupdeal.sqlite"));
    legacyWriter.prepare("INSERT OR REPLACE INTO app_state(id,state_json,updated_at) VALUES(1,?,?)").run(JSON.stringify({legacyWriter:true}),Date.now());
    assert.throws(()=>store.save(),/legacy writer/);
    legacyWriter.close();
    console.log("✔ Legacy app_state writes after migration block cutover rather than create two authorities");
  } finally {
    store.close();
    const resolved = path.resolve(testDir);
    if (path.dirname(resolved) !== path.resolve(os.tmpdir()) || !path.basename(resolved).startsWith("groupdeal-sqlite-")) throw new Error("Invalid test cleanup target");
    fs.rmSync(resolved, { recursive: true, force: true });
  }
  console.log("All SQLite transaction tests passed!\n");
}

runTransactionalStoreTests();
