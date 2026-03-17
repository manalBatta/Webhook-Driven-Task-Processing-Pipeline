"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDeliveryEvent = void 0;
const connect_1 = require("../connect");
const schema_1 = require("../schema");
const createDeliveryEvent = async (event) => {
    const [row] = await connect_1.db.insert(schema_1.deliveryEvents).values(event).returning();
    return row;
};
exports.createDeliveryEvent = createDeliveryEvent;
