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


Webhook-Driven Task Processing Pipeline: Smart ATS Screener
This project is a TypeScript-based service
 designed to ingest, queue, and process webhooks through an asynchronous background worker
. While the core requirements called for a simple pipeline, this implementation features a Smart ATS (Applicant Tracking System) to demonstrate advanced engineering patterns in distributed systems.

--------------------------------------------------------------------------------
Architectural Decision: The "Full-Cycle" Workflow
A pivotal design decision was made to continue the pipeline across two distinct phases rather than stopping after the initial resume scan.
Why this decision was made:
From Pipeline to Orchestration: Instead of a simple "pass-through" tool, this decision transforms the service into an Event-Driven Workflow Orchestrator.
Stateful Processing: By continuing the journey, the system manages a candidate's "State" (e.g., Screened -> Invited -> Evaluated) within the PostgreSQL database (webhook_pipeline)
.
Real-World Value: A recruiter doesn't just need to know if a resume is good; they need the candidate to be automatically moved to the next hurdle (the assessment) to save time.

--------------------------------------------------------------------------------
Detailed Workflow Implementation
The pipeline is split into two logical phases that function as a single, cohesive automation engine.
Phase 1: AI-Driven Screening & Invitation
Trigger: A POST request to the unique pipeline source URL
.
Action: The Worker
 picks up the job and sends the resume text and job requirements to an LLM (OpenAI).
Branching Logic:
If Suitable: The worker automatically updates the candidates table and triggers a retry-protected invitation email containing a link to a technical assessment (e.g., Tally.so).
If Unsuitable: The job is logged as "completed" with a rejection reason, and the workflow terminates to prevent noise.
Phase 2: Assessment Evaluation & Final Delivery
Trigger: A second webhook is received when the candidate completes the assessment.
Action: The worker retrieves the candidate's existing record from the webhook_pipeline database
 using their email as a unique identifier.
Threshold Validation: If the assessment score is > 50, the system executes the final Subscriber Delivery
, notifying the recruiter via their registered URL (e.g., Slack or a CRM).

--------------------------------------------------------------------------------
Engineering Highlights
Asynchronous Processing: All heavy lifting (AI analysis and external API calls) is handled by the Worker
, ensuring the webhook ingestion endpoint remains highly responsive.
Reliability & Retries: Following core requirements, all external deliveries (Email invitations and Subscriber notifications) include retry logic to handle transient network failures or API downtimes.
Job Management: The recently enhanced Job Management API
 allows for real-time tracking of every stage in the ATS lifecycle, providing full visibility into candidate progress and delivery attempts.
Schema Integrity: Uses Drizzle ORM
 to maintain a robust relational structure, ensuring that metadata for job configurations and candidate scores are strictly typed and persisted.

--------------------------------------------------------------------------------
Setup & Usage
Database Access
To inspect the pipeline and candidate states directly from your terminal
:
psql -U postgres -d webhook_pipeline
Running the Service
Install dependencies: npm install
Start the API and Worker: npm run dev
Use the Job Management API
 to query the history of your ATS candidates.


to test the ATS screener I :
1.triggered a webhook with resume text that passed the AI screening
2.I sent an invetation to the candidate email with a google form assesment url 
3.the google form assesment triggers a webhook request to the ATS webhook with the candidate email and score. 
4.I used ngrok to tunnel the request from google forms into localhost:3000 
5. the Candidate was marked as passed with score >50 and the subscriber was notified with {"phase":"assessment","assessment":{"email":"manal.batta.1234@gmail.com","score":99},"candidate":{"id":"9f62e2fa-d5bf-4942-80bc-0adac0da4c97","email":"manal.batta.1234@gmail.com","name":"John Doe"}} information 