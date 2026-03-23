# Webhook-Driven Task Processing Pipeline 🚀

[![TypeScript](https://img.shields.io/badge/typescript-%233178C6.svg?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/node.js-%2343853D.svg?style=for-the-badge&logo=node.js&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/postgresql-%23316192.svg?style=for-the-badge&logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/docker-%230db7ed.svg?style=for-the-badge&logo=docker&logoColor=white)](https://www.docker.com/)

A powerful, scalable webhook-driven task processing pipeline that transforms incoming events into actionable workflows. Inspired by tools like Zapier, this system enables you to define pipelines that receive webhook events, process them intelligently, and deliver results to multiple subscribers.

---

## ✨ Features

✅ **Webhook Ingestion** - Receive events from any source via custom webhook endpoints
✅ **Asynchronous Processing** - Background job queue with retry logic
✅ **Multiple Processing Actions** - AI-powered screening, story generation, and scheduled forwarding
✅ **Multi-Channel Delivery** - Send results to Slack, email, or any HTTP endpoint
✅ **Pipeline Management** - Create, update, and delete workflows with REST API
✅ **SMART ATS Screener** - AI-powered resume evaluation with Gemini
✅ **GitHub Activity Storyteller** - Transform code changes into engaging stories
✅ **Scheduled Processor** - Delayed delivery of processed data
✅ **Delivery Tracking** - Comprehensive logging of all delivery attempts
✅ **Scalable Architecture** - Separate API and worker services

---

## 🛠️ Tech Stack

**Core Technologies:**

- TypeScript
- Express.js
- PostgreSQL
- Drizzle ORM

**Processing:**

- Google Generative AI (Gemini)
- Resend (Email)

**DevOps:**

- Docker
- Docker Compose
- Vitest (Testing)

---

## 📦 Installation

### Prerequisites

Before you begin, ensure you have:

- Node.js (v20 or higher)
- Docker (for containerized setup)
- PostgreSQL client (for database access)
- Git

### Quick Start with Docker

1. **Clone the repository:**
   ```bash
   git clone https://github.com/manalBatta/Webhook-Driven-Task-Processing-Pipeline.git
   cd webhook-driven-task-processing-pipeline
   ```


2. **Set up environment variables:**

   ```bash
   cp .env.example .env
   ```

   Edit the `.env` file with your configuration see Configuration section

3. **Start the services:**

   ```bash
   docker-compose up --build
   ```

4. **Access the API:**
   The API will be available at `http://localhost:3000`

### Alternative: Local Development

1. **Install dependencies:**

   ```bash
   npm install
   ```

2. **Set up your database:**
   - Create a PostgreSQL database
   - Update your `.env` file with the connection details

3. **Run migrations:**

   ```bash
   npm run db:migrate
   ```

4. **Start the services:**

   ```bash
   # In one terminal:
   npm run dev:api

   # In another terminal:
   npm run dev:worker
   ```

---

## 🎯 Usage Examples

### 1. Creating a Pipeline

```typescript
// Create a new GitHub Activity Storyteller pipeline
const newPipeline = {
  name: "GitHub Activity Notifications",
  actionType: "GITHUB_ACTIVITY_STORYTELLER",
  actionConfig: {
    tone: "professional",
    audience: "technical",
    maxLength: 500,
    includeFiles: true,
  },
};

// Send to API endpoint
fetch("http://localhost:3000/pipelines", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify(newPipeline),
})
  .then((response) => response.json())
  .then((data) => console.log("Pipeline created:", data));
```

### 2. Setting Up Subscribers

```typescript
// Add a Slack webhook subscriber
const subscriber = {
  targetUrl: "https://hooks.slack.com/services/YOUR_WEBHOOK_URL",
  isActive: true,
};

// Send to pipeline-specific endpoint
fetch("http://localhost:3000/pipelines/YOUR_PIPELINE_ID/subscribers", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify(subscriber),
})
  .then((response) => response.json())
  .then((data) => console.log("Subscriber added:", data));
```

### 3. Receiving Webhook Events

When you receive a GitHub webhook:

```json
{
  "ref": "refs/heads/main",
  "repository": {
    "full_name": "your-org/your-repo"
  },
  "pusher": {
    "name": "John Doe"
  },
  "commits": [
    {
      "id": "abc123",
      "message": "Add new feature",
      "added": ["src/components/NewComponent.tsx"],
      "modified": ["package.json"]
    }
  ]
}
```

Send it to your pipeline's webhook endpoint:

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"ref":"refs/heads/main","repository":{"full_name":"your-org/your-repo"},...}' \
  http://localhost:3000/jobs/webhooks/YOUR_PIPELINE_SOURCE_KEY
```

### 4. Processing ATS Resumes

For the SMART ATS Screener:

```typescript
// Example resume submission payload
const resumeSubmission = {
  resume_text:
    "Professional with 5+ years experience in software development...",
  candidate_info: {
    name: "Jane Developer",
    email: "jane@example.com",
  },
};

// This would be sent to your pipeline's webhook endpoint
// The system will automatically process it through the ATS pipeline
```

---

## 📁 Project Structure

```
.
├── src/
│   ├── api/                # API service
│   │   ├── routes/         # API route handlers
│   │   ├── __tests__/      # Integration tests
│   │   └── index.ts        # API entry point
│   ├── worker/             # Background worker
│   │   ├── actions/        # Processing actions
│   │   └── index.ts        # Worker entry point
│   ├── db/                 # Database schema and queries
│   │   ├── connect.ts      # Database connection
│   │   ├── queries/        # Database query functions
│   │   └── schema.ts       # Database schema definitions
│   └── types/              # TypeScript types
├── dist/                   # Compiled output
├── .env.example            # Environment variables template
├── docker-compose.yml      # Docker Compose configuration
├── Dockerfile              # Docker build configuration
├── package.json            # Project dependencies
├── tsconfig.json           # TypeScript configuration
└── README.md               # This file
```

---

## 🔧 Configuration

### Environment Variables

Create a `.env` file based on `.env.example` with your configuration:

```env
# Server configuration
PORT=3000
NODE_ENV=development

# Database configuration (used by docker-compose db service)
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_secure_password
POSTGRES_DB=webhook_pipeline

# Application connection string (inside docker-compose, host should be "db")
DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}

# AI and Email providers
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-flash
RESEND_API_KEY=your_resend_api_key
```

### Database Setup

The system uses PostgreSQL for all data storage. The Docker setup includes a PostgreSQL container that persists data in a Docker volume.

### Special Setup for ATS Screener

Before using the SMART ATS Screener action, you need to create a dummy subscriber for email logging:

```sql
INSERT INTO subscribers (id, pipeline_id, target_url, is_active)
VALUES (
  '00000000-0000-0000-0000-000000000000',
  '<YOUR_ATS_PIPELINE_ID>',
  'dummy-email-logger',
  true
);
```

Replace `<YOUR_ATS_PIPELINE_ID>` with the actual ID of your ATS pipeline.

---

## 👥 Authors & Contributors

**Maintainers:**

- [Manal Batta](https://github.com/manalBatta)

**Special Thanks:**
- Foothill Techonology Solutions
- The open-source community for inspiration
- Resend for email services


---

## 🐛 Issues & Support

### Reporting Issues

If you encounter any problems or have feature requests:

1. Search the [GitHub Issues](https://github.com/manalBatta/webhook-driven-task-processing-pipeline/issues) to see if it's already reported
2. If not, open a new issue with:
   - Clear description of the problem
   - Steps to reproduce
   - Expected behavior
   - Any relevant logs or error messages
   - Your environment details


---

## 🗺️ Roadmap

### Current Version (v1.0.0)

- Core pipeline functionality
- Basic processing actions
- Webhook ingestion
- Multi-channel delivery

### Planned Features

✅ **Short-term (Next Release)**

- [ ] Add more processing actions (e.g., Slack notifications, custom webhooks)
- [ ] Improve error handling and retries
- [ ] Add authentication for API endpoints
- [ ] Implement rate limiting

📌 **Medium-term**

- [ ] Add support for webhook signatures for security
- [ ] Add monitoring and analytics dashboard
- [ ] Support for more AI models



---

## 🎉 Getting Started Quick Guide

1. **Set up your environment** using the Docker instructions
2. **Create a pipeline** for your use case (GitHub, ATS, etc.)
3. **Add subscribers** to receive processed data
4. **Send webhook events** to your pipeline's endpoint
5. **Monitor processing** through the API endpoints
6. **Enhance with custom actions** by extending the action system

---


## 🚀 Join the Community

Stay updated with the latest developments:

- [GitHub Repository](https://github.com/manalBatta/webhook-driven-task-processing-pipeline)
- [Discussion Board](https://github.com/manalBatta/webhook-driven-task-processing-pipeline/discussions)

I'd love to hear how you're using this pipeline in your projects!

