# **Webhook-Driven Task Processing Pipeline**

_Technical Documentation_

---

## **1. Architecture Overview**

### **System Components**

The Webhook-Driven Task Processing Pipeline is a microservices-based system designed to process webhook events asynchronously, execute custom actions, and deliver results to subscribers. The architecture consists of the following key components:

| **Component**      | **Description**                                                                                        | **Technology**                    |
| ------------------ | ------------------------------------------------------------------------------------------------------ | --------------------------------- |
| **API Service**    | Handles webhook ingestion, pipeline management, and job orchestration.                                 | Express.js, TypeScript            |
| **Worker Service** | Processes jobs, executes actions (e.g., ATS screening, GitHub story generation), and delivers results. | TypeScript,                       |
| **PostgreSQL**     | Stores pipelines, jobs, subscribers, and delivery attempts.                                            | PostgreSQL, Drizzle ORM           |
|                    |
| **External APIs**  | Integrates with Gemini AI (Google) for AI-driven actions and Resend for email delivery.                | `@google/generative-ai`, `resend` |

---

### **Data Flow**

1. **Webhook Ingestion**
   - A webhook payload is sent to the API via a pipeline-specific endpoint (e.g., `/webhooks/{sourceKey}`).
   - The API validates the pipeline and creates a job record in PostgreSQL.

2. **Job Processing**
   - The API enqueues the job in the database with pending status and returns success response.
   - The Worker service picks up the job, processes it based on the pipeline's `actionType`, and updates the job status.

3. **Action Execution**
   - **ATS Screener**: Uses Gemini AI to evaluate resumes against job requirements.
   - **GitHub Storyteller**: Generates a narrative from GitHub push events.
   - **Scheduled Processor**: Delays delivery of payloads (e.g., for time-based forwarding).

4. **Delivery**
   - The Worker delivers the processed payload to all active subscribers (e.g., Slack, email).
   - Delivery attempts are logged with retry logic (max `3` attempts with exponential backoff).

5. **Persistence**
   - All data (pipelines, jobs, subscribers, delivery attempts) is stored in PostgreSQL using Drizzle ORM.

---

### **Key Features**

| **Feature**                | **Description**                                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------- |
| **Webhook-Driven**         | Accepts webhook events from external services (e.g., GitHub, ATS).                                    |
| **AI-Powered Actions**     | Integrates with Gemini AI for resume screening and GitHub activity storytelling.                      |
| **Retry Logic**            | Failed deliveries are retried with exponential backoff (max `3` attempts).                            |
| **Subscriber Management**  | Supports multiple subscribers (e.g., Slack, email) per pipeline.                                      |
| **Pipeline Configuration** | Define custom actions (e.g., `SMART_ATS_SCREENER`, `GITHUB_ACTIVITY_STORYTELLER`) via `actionConfig`. |

---

### **Endpoints**

#### **Pipelines**

| **Endpoint**     | **Method** | **Description**        | **Request Body**                                                | **Response**                                       |
| ---------------- | ---------- | ---------------------- | --------------------------------------------------------------- | -------------------------------------------------- |
| `/pipelines`     | `POST`     | Create a new pipeline. | `{ name: string, actionType: string, actionConfig: object }`    | `201 Created` with pipeline object.                |
| `/pipelines`     | `GET`      | List all pipelines.    | -                                                               | `200 OK` with array of pipelines.                  |
| `/pipelines/:id` | `GET`      | Get a pipeline by ID.  | -                                                               | `200 OK` with pipeline object or `404 Not Found`.  |
| `/pipelines/:id` | `PUT`      | Update a pipeline.     | `{ name?: string, actionType?: string, actionConfig?: object }` | `200 OK` with updated pipeline or `404 Not Found`. |
| `/pipelines/:id` | `DELETE`   | Delete a pipeline.     | -                                                               | `200 OK` or `404 Not Found`.                       |

---

#### **Subscribers**

| **Endpoint**                 | **Method** | **Description**                      | **Request Body**        | **Response**                                                      |
| ---------------------------- | ---------- | ------------------------------------ | ----------------------- | ----------------------------------------------------------------- |
| `/pipelines/:id/subscribers` | `POST`     | Add a subscriber to a pipeline.      | `{ targetUrl: string }` | `201 Created` with subscriber object or `404 Pipeline Not Found`. |
| `/pipelines/:id/subscribers` | `GET`      | List all subscribers for a pipeline. | -                       | `200 OK` with array of subscribers or `404 Pipeline Not Found`.   |

---

#### **Jobs**

| **Endpoint**           | **Method** | **Description**                           | **Request Body**                                                                                      | **Response**                                                            |
| ---------------------- | ---------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `/webhooks/:sourceKey` | `POST`     | Ingest a webhook payload into a pipeline. | `{ rawPayload: object }`                                                                              | `202 Accepted` with job ID or `404 Pipeline Not Found`.                 |
| `/jobs`                | `GET`      | List jobs (with optional filters).        | `?pipelineId=<id>&status=<status>&limit=<number>&minCandidateScore=<score>&maxCandidateScore=<score>` | `200 OK` with array of jobs.                                            |
| `/jobs/:id`            | `GET`      | Get job details and delivery history.     | -                                                                                                     | `200 OK` with job object including deliveryAttempts or `404 Not Found`. |

---

### **Example Requests**

#### **Create a Pipeline**

```bash
curl -X POST http://localhost:3000/pipelines \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ATS Screening Pipeline",
    "actionType": "SMART_ATS_SCREENER",
    "actionConfig": {
      "jobRequirements": ["JavaScript", "TypeScript", "Node.js"]
    }
  }'
```

#### **Ingest a Webhook**

```bash
curl -X POST http://localhost:3000/webhooks/{sourceKey} \
  -H "Content-Type: application/json" \
  -d '{
    "resume_text": "Experienced developer with 5 years of JavaScript experience...",
    "candidate_info": {
      "name": "John Doe",
      "email": "john@example.com"
    }
  }'
```

#### **Get Job History**

```bash
curl -X GET http://localhost:3000/jobs/{jobId}
```

---

## **3. Database Schema**

### **Tables**

The system uses PostgreSQL with the following tables:

| **Table**          | **Description**                                   | **Columns**                                                                                                                         |
| ------------------ | ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `pipelines`        | Stores pipeline configurations.                   | `id`, `name`, `sourceKey`, `actionType`, `actionConfig`, `createdAt`                                                                |
| `subscribers`      | Stores subscriber endpoints (e.g., Slack, email). | `id`, `pipelineId`, `targetUrl`, `isActive`, `createdAt`                                                                            |
| `jobs`             | Stores job records (webhook payloads).            | `id`, `pipelineId`, `rawPayload`, `processedPayload`, `status`, `retries`, `nextRunAt`, `createdAt`, `updatedAt`                    |
| `candidates`       | Stores candidate information from ATS screening.  | `id`, `pipelineId`, `jobId`, `name`, `email`, `resumeSummary`, `aiScore`, `status`, `metadata`, `createdAt`                         |
| `deliveryAttempts` | Logs delivery attempts to subscribers.            | `id`, `jobId`, `subscriberId`, `targetUrl`, `candidateEmail`, `attemptNumber`, `statusCode`, `success`, `errorMessage`, `createdAt` |

---

### **Appendix: Key Dependencies**

| **Dependency**          | **Purpose**                                       |
| ----------------------- | ------------------------------------------------- |
| `@google/generative-ai` | Integrates with Google Gemini for AI actions.     |
| `drizzle-orm`           | PostgreSQL ORM for type-safe database operations. |
| `express`               | Web framework for the API service.                |
| `resend`                | Email delivery service.                           |
| `zod`                   | Runtime validation library.                       |

---

This documentation provides a comprehensive overview of the **Webhook-Driven Task Processing Pipeline**, covering architecture, setup, API usage, database schema, and deployment. For further details, refer to the source code and comments in the repository.
