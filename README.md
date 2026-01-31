# Multi-Platform Reach-Out Tool

An AI-powered automation platform for discovering and engaging with healthcare professionals across multiple Dutch job platforms. Built for **Nationale Hulpgids** to streamline candidate outreach with intelligent matching, personalized messaging, and campaign management.

## 🎯 Overview

This tool automates the entire candidate outreach workflow:

1. **Multi-Platform Scraping** - Discovers candidates from 5 major platforms (Nationale Hulpgids, Indeed, PGBvacatures, Zorgbanen, Jobbird)
2. **AI-Powered Matching** - Scores candidate compatibility using LLM-based analysis
3. **Personalized Messaging** - Generates tailored outreach messages in Dutch/English
4. **Campaign Management** - Schedules, monitors, and tracks outreach campaigns
5. **Queue System** - Manages job processing with rate limiting and retry logic

## 🏗️ Architecture

### Tech Stack

**Frontend:**
- React 19 + TypeScript
- Tailwind CSS 4 + shadcn/ui
- Wouter (routing)
- tRPC client

**Backend:**
- Node.js + Express 4
- tRPC 11 (end-to-end type safety)
- Drizzle ORM (MySQL/TiDB)
- Manus OAuth (authentication)

**Key Libraries:**
- **Crawlee** - Production-grade web scraping with anti-detection
- **rate-limiter-flexible** - Platform-compliant rate limiting
- **Cheerio** - HTML parsing
- **Superjson** - Type-safe serialization

### Project Structure

```
├── client/                    # React frontend
│   ├── src/
│   │   ├── pages/            # Page components
│   │   ├── components/       # Reusable UI components
│   │   ├── lib/trpc.ts       # tRPC client setup
│   │   └── App.tsx           # Routes & layout
│   └── public/               # Static assets
│
├── server/                    # Express backend
│   ├── routers.ts            # tRPC procedures
│   ├── db.ts                 # Database queries
│   ├── services/             # Business logic
│   │   ├── platformScraper.ts       # Scraper factory
│   │   ├── scrapers/                # Platform-specific scrapers
│   │   │   ├── crawleeNationaleHulpgids.ts
│   │   │   ├── crawleeIndeed.ts
│   │   │   ├── crawleePGBvacatures.ts
│   │   │   ├── crawleeZorgbanen.ts
│   │   │   └── crawleeJobbird.ts
│   │   ├── aiMatching.ts            # AI compatibility scoring
│   │   ├── inMemoryQueue.ts         # Job queue system
│   │   ├── rateLimiter.ts           # Rate limiting
│   │   └── scheduledCampaigns.ts    # Campaign scheduler
│   └── _core/                # Framework plumbing
│
├── drizzle/                   # Database schema & migrations
│   └── schema.ts             # Table definitions
│
└── shared/                    # Shared types & constants
```

## 🚀 Features

### 1. Multi-Platform Scraping

All scrapers use **Crawlee** for production-grade reliability:

- **Anti-Detection** - Human-like fingerprints, TLS replication
- **Session Management** - Automatic cookie handling
- **Proxy Rotation** - IP rotation support (configurable)
- **Rate Limiting** - Platform-specific limits (10-20 req/min)

**Supported Platforms:**
- Nationale Hulpgids (primary target, 419+ helpers in Arnhem)
- Indeed
- PGBvacatures
- Zorgbanen
- Jobbird

### 2. AI-Powered Matching

Uses LLM (via Manus Forge API) to:
- Analyze candidate profiles against job requirements
- Generate compatibility scores (0-100)
- Identify key matching factors (experience, location, services)
- Provide reasoning for match quality

### 3. Campaign Management

**Unified Interface** with 3 tabs:
- **Active Campaigns** - Running campaigns with real-time stats
- **Scheduled Campaigns** - Upcoming campaigns with pause/resume
- **Queue Monitor** - Job tracking with status breakdown

**Campaign Features:**
- Multi-platform targeting
- Location-based filtering
- Service/skill matching
- Budget constraints
- Scheduled execution (one-time or recurring)
- Automated messaging
- Response tracking

### 4. Message Queue System

In-memory queue (BullMQ-compatible API):
- Job prioritization by compatibility score
- Automatic retries with exponential backoff
- Rate limiting per platform
- Real-time progress tracking
- Job history with error logs

### 5. Message Review Dashboard

Before sending, review and edit:
- All queued messages
- Inline editing
- Bulk approve/reject
- Filter by campaign, platform, status

## 📦 Installation

### Prerequisites

- Node.js 22+
- pnpm 9+
- MySQL/TiDB database
- Manus account (for OAuth & LLM)

### Setup

1. **Clone the repository:**
```bash
git clone https://github.com/Noodzakelijk-Online/010-Nationale-Hulpgids-reach-out.git
cd 010-Nationale-Hulpgids-reach-out
```

2. **Install dependencies:**
```bash
pnpm install
```

3. **Configure environment variables:**

The following env vars are auto-injected by Manus platform:
- `DATABASE_URL` - MySQL connection string
- `JWT_SECRET` - Session signing secret
- `OAUTH_SERVER_URL` - Manus OAuth backend
- `VITE_OAUTH_PORTAL_URL` - Manus login portal
- `BUILT_IN_FORGE_API_URL` - LLM API endpoint
- `BUILT_IN_FORGE_API_KEY` - LLM API key

4. **Push database schema:**
```bash
pnpm db:push
```

5. **Start development server:**
```bash
pnpm dev
```

The app will be available at `http://localhost:3000`

## 🔧 Development

### Database Migrations

```bash
# Push schema changes to database
pnpm db:push

# Generate migration files
pnpm db:generate

# Apply migrations
pnpm db:migrate
```

### Testing

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test server/messages.test.ts
```

### Code Quality

```bash
# TypeScript type checking
pnpm tsc --noEmit

# Linting (if configured)
pnpm lint
```

## 🎨 Key Components

### Campaign Wizard (`client/src/components/CampaignWizard.tsx`)

4-step wizard for campaign creation:
1. **Campaign Details** - Title, description, platforms
2. **Target Criteria** - Location, experience, services, budget
3. **AI Matching** - Compatibility threshold, max candidates
4. **Review & Launch** - Scheduling, automated messaging

### Platform Scrapers (`server/services/scrapers/`)

Each scraper extends Crawlee's `CheerioCrawler`:
- `authenticate()` - Login with credentials
- `searchCandidates()` - Find candidates matching criteria
- `getCandidateDetails()` - Fetch full profile
- `sendMessage()` - Send outreach message

### tRPC Routers (`server/routers.ts`)

Type-safe API procedures:
- `campaigns.*` - Campaign CRUD, stats, scheduling
- `candidates.*` - Discovery, matching, listing
- `messages.*` - Generation, review, bulk operations
- `platformCredentials.*` - Credential management, testing
- `queue.*` - Job stats, history

## 🔐 Security

- **Authentication** - Manus OAuth with JWT sessions
- **Authorization** - User-scoped data access
- **Rate Limiting** - Per-user API limits (100 req/min)
- **Input Validation** - Zod schemas on all tRPC procedures
- **SQL Injection** - Drizzle ORM with parameterized queries
- **XSS Protection** - React auto-escaping + CSP headers

## 📊 Rate Limits

**Scraper Limits (per platform):**
- Nationale Hulpgids: 10 req/min
- Indeed: 20 req/min
- PGBvacatures: 15 req/min
- Zorgbanen: 15 req/min
- Jobbird: 20 req/min

**Messaging Limits (per platform):**
- All platforms: 5-10 messages/min

**API Limits:**
- Per user: 100 req/min
- Authentication: 5 attempts/15min

## 🚢 Deployment

This project is designed for deployment on **Manus Platform** which provides:
- Automatic SSL certificates
- Custom domain support
- Built-in OAuth
- LLM API access
- Database hosting
- One-click deployment

For external hosting, ensure:
1. MySQL/TiDB database is accessible
2. OAuth provider is configured
3. LLM API credentials are set
4. Environment variables are properly configured

## 📝 Database Schema

**Key Tables:**
- `users` - User accounts (via Manus OAuth)
- `campaigns` - Outreach campaigns
- `candidates` - Discovered candidates
- `messages` - Generated messages
- `platforms` - Platform definitions
- `platformCredentials` - User platform credentials

See `drizzle/schema.ts` for full schema.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is proprietary software owned by **Noodzakelijk Online**.

## 🙋 Support

For questions or issues:
- GitHub Issues: https://github.com/Noodzakelijk-Online/010-Nationale-Hulpgids-reach-out/issues
- Email: noodzakelijkonline@gmail.com

## 🎯 Roadmap

- [ ] Add Redis support for distributed queue
- [ ] Implement email notifications
- [ ] Add campaign analytics dashboard
- [ ] Support for additional platforms
- [ ] A/B testing for message templates
- [ ] Conversation threading
- [ ] Response sentiment analysis

---

**Built with ❤️ for Nationale Hulpgids**
