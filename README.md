# To enter the database from terminal
``bash
psql -U postgres -d webhook_pipeline
``

# Webhook-Driven Task Processing Pipeline

## Overview

This project implements a webhook-driven task processing system inspired by tools like Zapier. It allows users to define pipelines that:

1. Receive webhook events
2. Process the incoming payload
3. Deliver results to one or more subscribers

The system is designed to handle asynchronous processing, retries, and scalable job execution.

---

## Architecture

The system consists of:

* **API Service** — Handles pipeline management and webhook ingestion
* **Queue (BullMQ + Redis)** — Manages job scheduling and processing
* **Worker** — Processes jobs and delivers results
* **PostgreSQL** — Stores pipelines, jobs, subscribers, and delivery attempts

```
Client → API → Queue (Redis/BullMQ) → Worker → Subscribers
                ↓
            PostgreSQL
```

---

## Features

* CRUD API for pipelines and subscribers
* Webhook ingestion endpoint per pipeline
* Background job processing using a queue
* Multiple processing actions:

  * JSON extraction
  * Template transformation
  * Filtering
* Delivery to multiple subscribers
* Retry logic with backoff for failed deliveries
* Job tracking and delivery attempt history
* SMART ATS Screener action (Gemini-powered)

---

## Processing Flow

1. A webhook is sent to a pipeline-specific endpoint
2. The API enqueues a job into BullMQ
3. The worker picks up the job
4. The payload is processed based on pipeline configuration
5. The result is delivered to all active subscribers
6. Delivery attempts are recorded with retry logic

---

## Environment Variables

Set these in your `.env` (never commit it):

- **DATABASE_URL**: PostgreSQL connection string
- **GEMINI_API_KEY**: Gemini API key used by the `SMART_ATS_SCREENER` action
- **GEMINI_MODEL** (optional): defaults to `gemini-1.5-flash`

---

## Design Decisions

### 1. Initial Approach: Database-Backed Queue

The system was initially implemented using a custom queue backed by PostgreSQL.

**How it worked:**

* Jobs were stored in a `jobs` table
* A worker continuously polled for pending jobs
* Jobs were claimed using row-level locking (`FOR UPDATE SKIP LOCKED`)
* Delivery attempts were retried with a fixed delay

**Why this approach was valuable:**

* Helped build a deep understanding of how queues work internally
* Required handling:

  * concurrency control
  * job state transitions
  * retry logic
* Provided full control over job lifecycle

**Limitations:**

* Inefficient polling (constant DB queries)
* Increased database load under high throughput
* More complex to maintain as features grow
* Not ideal for horizontal scaling

---

### 2. Final Approach: BullMQ (Redis-Based Queue)

After validating the custom implementation, the system was migrated to **BullMQ** for improved scalability and reliability.

**Why BullMQ was chosen:**

* Built-in job locking (prevents duplicate processing)
* Efficient queueing without polling
* Native retry and backoff strategies
* Better performance under high load
* Designed for distributed workers

**What BullMQ handles:**

* Job scheduling
* Concurrency control
* Retry mechanisms
* Worker coordination

**What remains in PostgreSQL:**

* Pipelines and subscribers
* Job metadata and processed payloads
* Delivery attempt history

---

## Trade-offs Between Approaches

| Aspect         | DB Queue                 | BullMQ (Redis)            |
| -------------- | ------------------------ | ------------------------- |
| Learning value | High                     | Medium                    |
| Performance    | Moderate                 | High                      |
| Scalability    | Limited                  | Excellent                 |
| Complexity     | Higher (manual handling) | Lower (built-in features) |
| Reliability    | Manual implementation    | Built-in guarantees       |

---

## Why Both Approaches Matter

The project intentionally includes both approaches:

* The **database-backed queue** demonstrates understanding of core concepts
* The **BullMQ implementation** demonstrates practical engineering decisions

This progression reflects how real-world systems evolve:

> Start simple → understand the problem → adopt the right tools for scale

---

## Running the Project

### Prerequisites

* Docker
* Docker Compose

### Start services

```bash
docker compose up --build
```

---

## Example Usage

### Create a pipeline

```bash
POST /pipelines
```

### Add a subscriber

```bash
POST /pipelines/:id/subscribers
```

### Send webhook

```bash
POST /webhook/:source_path
```

---

## Testing

The system can be tested by:

* Sending webhooks to pipeline endpoints
* Observing job processing in the worker logs
* Verifying delivery attempts in the database
* Using webhook testing tools like Webhook.site

---

## Future Improvements

* Dead-letter queue for permanently failed jobs
* Rate limiting per subscriber
* Observability (metrics, logging, tracing)
* Dashboard for monitoring pipelines and jobs

---

## Summary

This project demonstrates both:

* A **from-scratch implementation of a job queue**
* A **production-ready scalable solution using BullMQ**

The goal was not just to build a working system, but to understand the underlying mechanics and make informed architectural decisions.
