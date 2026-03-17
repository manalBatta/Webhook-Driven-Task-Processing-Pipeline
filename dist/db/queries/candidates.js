"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCandidateByJobId = exports.createCandidate = void 0;
const connect_1 = require("../connect");
const schema_1 = require("../schema");
const createCandidate = async (candidate) => {
    const [row] = await connect_1.db.insert(schema_1.candidates).values(candidate).returning();
    return row;
};
exports.createCandidate = createCandidate;
const getCandidateByJobId = async (jobId) => {
    const rows = await connect_1.db.select().from(schema_1.candidates).where((t, { eq }) => eq(t.jobId, jobId));
    return rows[0];
};
exports.getCandidateByJobId = getCandidateByJobId;
