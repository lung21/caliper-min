import { StoreEntry } from 'task-aggregator';

let prob = require("prob.js");

export let info: string = "financier's generator";
let bc: any;
let ctx: any;
let nTxn: number;
let nAccount: number;
let sleepMS: number;
let nRead: number;
let nWrite: number;
let updateSize: number;
let zipfs: number;
let persistentFilepath: string;

function getSampler(n: number): any {
    return Math.random() * n;
}

function getZipfSampler(n: number, s: number): any {
    return prob.zipf(s, n);
}

function getUniformSampler(n: number): any {
    return prob.uniform(0, n);
}

function getAccount(accountSampler) {
    return "A" + Math.floor(accountSampler()).toString(10);
}

function generateTasks(nTxn: number, nAccount: number, sleepMS: number, nRead: number, nWrite: number, updateSize: number, zipfs?: number) {
    let tasks: any[] = [];
    let sampler: any;
    
    if (zipfs === undefined) {
        sampler = getUniformSampler(nAccount);
    } else {
        sampler = getZipfSampler(nAccount - 1, zipfs);
    }

    for (let i = 0; i < nTxn; i++) {
        let readKeys: string[] = [];
        let writeKeys: string[] = [];
        for (let j = 0; j < nRead; j++) {
            let accountName: string = getAccount(sampler);
            readKeys.push(accountName);
        }

        for (let j = 0; j < nWrite; j++) {
            let accountName: string = getAccount(sampler);
            writeKeys.push(accountName);
        }

        let task: any = {
            sleepMS,
            nRead,
            nWrite,
            updateSize,
            readKeys,
            writeKeys,
            "transaction_type": "readAndWrite"
        };

        tasks.push(task);

    }

    return tasks;

}

export async function run() {

    let tasks: any[];

    if (persistentFilepath === undefined) {
        tasks = generateTasks(nTxn, nAccount, sleepMS, nRead, nWrite, updateSize, zipfs);
        ctx.tasks = tasks;
    } else {
        tasks = ctx.tasks;
    }

    return bc.invokeSmartContract(ctx, ctx.contractID, 'v0', tasks, 30);
}

export function init(blockchain: any, context: any, args: any) {
    if (args.nTxn === undefined || args.nAccount === undefined) {
        return Promise.reject("Required more arguments");
    }

    bc = blockchain;
    ctx = context;
    nTxn = args.nTxn;
    sleepMS = args.sleepMS;
    nAccount = args.nAccount;
    nRead = args.nRead;
    nWrite = args.nWrite;
    updateSize = args.updateSize;
    
    if (args.zipfs !== undefined) { 
        zipfs = args.zipfs;
    }

    if (args.persistentFilepath !== undefined) {
        persistentFilepath = args.persistentFilepath;
    }

    return Promise.resolve();
};

export function end() {
    return Promise.resolve();
}
