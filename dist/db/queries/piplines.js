"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPipline = exports.getPipelineBySourceKey = exports.getPipelineById = exports.getAllPiplines = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const connect_1 = require("../connect");
const schema_1 = require("../schema");
const getAllPiplines = async () => await connect_1.db.select().from(schema_1.pipelines);
exports.getAllPiplines = getAllPiplines;
const getPipelineById = async (id) => {
    const rows = await connect_1.db.select().from(schema_1.pipelines).where((0, drizzle_orm_1.eq)(schema_1.pipelines.id, id));
    return rows[0];
};
exports.getPipelineById = getPipelineById;
const getPipelineBySourceKey = async (sourceKey) => {
    const rows = await connect_1.db.select().from(schema_1.pipelines).where((0, drizzle_orm_1.eq)(schema_1.pipelines.sourceKey, sourceKey));
    return rows[0];
};
exports.getPipelineBySourceKey = getPipelineBySourceKey;
const createPipline = async ({ name, actionType, actionConfig, }) => await connect_1.db
    .insert(schema_1.pipelines)
    .values({ name, actionType, actionConfig, sourceKey: crypto.randomUUID() })
    .returning();
exports.createPipline = createPipline;
