# Multi-Platform Reach-Out Tool - Development TODO

## Project Overview
Automated reach-out system for care workers and job seekers across 5 Dutch platforms: Indeed.com, Nationale Hulpgids, PGBvacatures.nl, Zorgbanen.nl, and Jobbird.com.

---

## CURRENT SPRINT: End-User Testing & Aesthetics Overhaul

### 🔍 End-User Testing (In Progress)
- [ ] Test login/authentication flow
- [ ] Test Home dashboard - click all cards and buttons
- [ ] Test Platform Connections page - add/edit/delete credentials
- [ ] Test Campaigns page - create/view/edit campaigns
- [ ] Test Candidates page - search, filter, view details
- [ ] Test Messages page - view messages, track responses
- [ ] Test navigation between all pages
- [ ] Test responsive design on mobile viewport
- [ ] Identify all broken links and non-functional buttons
- [ ] Document all bugs and UX issues found

### 🐛 Bug Fixes (Pending)
- [ ] Fix any broken API endpoints
- [ ] Fix any TypeScript errors in console
- [ ] Fix non-functional buttons and forms
- [ ] Fix navigation issues
- [ ] Fix data loading and error states

### 🎨 Aesthetics Overhaul (Pending)
- [ ] Choose modern color palette (primary, secondary, accent colors)
- [ ] Update typography (font family, sizes, weights)
- [ ] Improve visual hierarchy with better spacing
- [ ] Add subtle animations and transitions
- [ ] Enhance card designs with shadows and borders
- [ ] Improve button styles and hover states
- [ ] Add icons throughout the interface
- [ ] Create consistent design language across all pages
- [ ] Improve empty states with illustrations
- [ ] Add loading skeletons for better perceived performance
- [ ] Enhance dashboard stats cards with gradients/colors
- [ ] Improve form designs with better input styling
- [ ] Add success/error toast notifications with better styling

---

## Phase 1: Database Schema & Models
- [x] Design database schema for multi-platform data
- [x] Create platforms table (id, name, baseUrl, authType, status)
- [x] Create campaigns table (id, userId, title, description, targetPlatforms, status, createdAt)
- [x] Create candidates table (id, campaignId, platform, name, email, profileUrl, location, experience, services, availability, compatibility score)
- [x] Create messages table (id, campaignId, candidateId, platform, content, status, sentAt, respondedAt)
- [x] Create platform_credentials table (id, userId, platform, email, encryptedPassword, sessionData, lastSync)
- [x] Create match_factors table (id, candidateId, factor, score, reasoning)
- [x] Push database schema with `pnpm db:push`

## Phase 2: Backend Services & API
- [ ] Create platform integration service (server/services/platformIntegration.ts)
- [ ] Implement Nationale Hulpgids scraper and authentication
- [ ] Implement PGBvacatures.nl scraper and authentication
- [ ] Implement Zorgbanen.nl scraper and authentication
- [ ] Implement Jobbird.com scraper and authentication
- [ ] Implement Indeed.com API integration
- [x] Create AI matching service with LLM integration (server/services/aiMatching.ts)
- [x] Implement 25+ factor compatibility scoring algorithm
- [x] Create message generation service with Dutch/English support
- [ ] Create bulk outreach service with rate limiting
- [ ] Create response tracking and follow-up automation service
- [x] Add database query helpers in server/db.ts
- [x] Create tRPC procedures in server/routers.ts for all features

## Phase 3: Frontend Dashboard
- [x] Design modern dashboard layout with sidebar navigation
- [x] Create Platform Connections page (manage credentials for 5 platforms)
- [x] Create Campaigns page (create/manage outreach campaigns)
- [x] Create Candidates Discovery page (search and filter across platforms)
- [ ] Create Matches page (view compatibility scores and reasoning)
- [x] Create Messages page (track sent messages and responses)
- [ ] Create Analytics page (response rates, platform performance)
- [ ] Create Settings page (user preferences, notification settings)
- [x] Implement real-time status indicators for platform connections
- [x] Add loading states and error handling for all operations
- [ ] Implement optimistic updates for better UX

## Phase 4: AI & Automation Features
- [ ] Integrate LLM for intelligent message personalization
- [ ] Implement automated follow-up sequences
- [ ] Create smart scheduling system for optimal send times
- [ ] Add A/B testing for message templates
- [ ] Implement response classification (interested/not interested/needs follow-up)
- [ ] Create automated workflow triggers based on responses

## Phase 5: Security & Performance
- [ ] Implement secure credential encryption for platform passwords
- [ ] Add rate limiting to prevent platform blocking
- [ ] Implement session management and auto-refresh
- [ ] Add comprehensive error logging and debugging tools
- [ ] Optimize database queries for large datasets
- [ ] Implement caching for frequently accessed data

## Phase 6: Testing & Deployment
- [ ] Write vitest tests for all tRPC procedures
- [ ] Test platform integrations with real credentials
- [ ] Test AI matching accuracy with sample data
- [ ] Test bulk messaging with rate limits
- [ ] Verify response tracking and follow-ups
- [x] Create initial checkpoint for deployment
- [x] Deploy and expose application for user interaction

## Phase 7: Documentation
- [ ] Create user guide for platform setup
- [ ] Document AI matching algorithm and factors
- [ ] Create troubleshooting guide for common issues
- [ ] Document API endpoints and data structures
- [ ] Create video walkthrough of key features

---

## Feature Priorities
**High Priority (Must Have)**
- Multi-platform authentication and session management
- Candidate discovery and intelligent matching
- Bulk message sending with personalization
- Response tracking dashboard

**Medium Priority (Should Have)**
- Automated follow-up sequences
- A/B testing for messages
- Advanced analytics and reporting
- Smart scheduling optimization

**Low Priority (Nice to Have)**
- Multi-language support beyond Dutch/English
- Integration with CRM systems
- Mobile app version
- Team collaboration features

---

## Technical Stack
- **Frontend**: React 19 + Tailwind 4 + shadcn/ui
- **Backend**: Express 4 + tRPC 11 + Drizzle ORM
- **Database**: MySQL/TiDB
- **AI**: Manus LLM integration
- **Authentication**: Manus OAuth + platform-specific auth
- **Deployment**: Manus hosting platform

---

## NEW SPRINT: Complete Campaign Creation & Automated Outreach

### Campaign Creation Wizard
- [x] Create multi-step campaign wizard component
- [x] Step 1: Campaign details (title, description, target platforms)
- [x] Step 2: Target criteria (location, experience, services, budget)
- [x] Step 3: AI matching configuration (compatibility threshold, max candidates)
- [x] Step 4: Review and launch campaign (UI complete)
- [x] Add form validation and error handling
- [x] Implement progress indicator for wizard steps
- [x] Connect Step 4 to actually trigger candidate discovery
- [x] Add live progress indicator during candidate discovery
- [x] Show toast notifications for discovery progress
- [ ] Add detailed candidate review page with compatibility scores

### Web Scrapers for 5 Platforms
- [ ] Implement Indeed.com scraper (job listings, candidate profiles)
- [ ] Implement Nationale Hulpgids scraper (helper profiles, services)
- [ ] Implement PGBvacatures.nl scraper (PGB care providers)
- [ ] Implement Zorgbanen.nl scraper (healthcare job candidates)
- [ ] Implement Jobbird.com scraper (job seeker profiles)
- [ ] Add rate limiting and error handling for scrapers
- [ ] Implement session management for authenticated scraping

### Automated Messaging System
- [ ] Build AI message generation service (no templates - AI decides content)
- [ ] Implement bulk outreach with rate limiting
- [ ] Add message queue system for reliable delivery
- [ ] Create response tracking and parsing
- [ ] Implement automated follow-up sequences
- [ ] Add message status monitoring dashboard

---

## Current Status
- [x] Project initialized with web-db-user template
- [x] Development environment configured
- [x] Database schema designed
- [x] Backend services implemented (AI matching, message generation)
- [x] Frontend dashboard created (Home, Campaigns, Candidates, Messages, Platform Connections)
- [ ] Platform integrations completed (scrapers for 5 platforms)
- [x] AI matching system operational
- [ ] End-user testing completed
- [ ] Aesthetics overhaul completed
- [x] Deployed and accessible (preview URL available)


## CURRENT WORK SESSION (Jan 25, 2026)

### Phase 1: Platform Scraper Infrastructure
- [x] Review existing platform scraper implementation
- [x] Install cheerio for HTML parsing
- [ ] Enhance Nationale Hulpgids scraper with real authentication
- [ ] Implement real candidate discovery for Nationale Hulpgids (419 helpers in Arnhem)
- [ ] Test scraper with real credentials (noodzakelijkonline@gmail.com)

### Phase 2: Complete All Platform Scrapers
- [ ] Enhance Indeed.com scraper with real API/scraping
- [ ] Enhance PGBvacatures.nl scraper with real scraping
- [ ] Enhance Zorgbanen.nl scraper with real scraping
- [ ] Enhance Jobbird.com scraper with real scraping

### Phase 3: Campaign Wizard Completion
- [x] Implement Step 2: Candidate Discovery UI (trigger scrapers, show progress)
- [x] Implement Step 3: Review Matches UI (show compatibility scores, select candidates)
- [x] Implement Step 4: Launch Campaign UI (confirm and start automated outreach)
- [x] Integrate candidate discovery mutation into wizard
- [x] Add progress indicators and toast notifications

### Phase 4: Automated Messaging
- [x] Integrate AI message generation into campaign launch
- [x] Implement bulk message sending with rate limiting
- [x] Add message queue and status tracking
- [x] Create bulkOutreach tRPC procedure
- [x] Add automated messaging checkbox to campaign wizard
- [ ] Test end-to-end flow with real Nationale Hulpgids data


---

## NEW ENHANCEMENTS: Message Review, Credentials Testing & Response Tracking

### Message Review Dashboard
- [x] Create dedicated Messages Review page component
- [x] Display all queued messages with candidate details
- [x] Add inline message editing capability
- [x] Implement approve/reject actions for individual messages
- [x] Add bulk approve/reject functionality
- [x] Show message preview with formatting
- [x] Add filter by campaign, platform, status
- [x] Implement message status updates (queued → approved → sent)
- [x] Add tRPC procedures: listAll, updateStatus, update, bulkUpdateStatus
- [x] Add database functions: getAllMessages, updateMessageStatus, bulkUpdateMessageStatus
- [x] Update message status enum to include approved, replied, rejected

### Platform Credentials Testing
- [x] Add "Test Connection" button to platform credentials form
- [x] Implement testConnection tRPC procedure for Nationale Hulpgids
- [x] Show connection status (success/failure) with error details
- [x] Add visual indicators for connected vs disconnected platforms
- [ ] Store last tested timestamp in database (optional enhancement)
- [x] Display connection health on Platforms page

### Response Tracking & Inbox Monitoring
- [x] Add response status to messages table (replied, responded in schema)
- [x] Implement engagement metrics (response rate, avg response time, trend)
- [x] Create engagement analytics component with visual breakdown
- [x] Add getEngagementMetrics tRPC procedure and database function
- [ ] Create inbox monitoring service for candidate replies (future enhancement)
- [ ] Add notification system for new candidate replies (future enhancement)
- [ ] Implement conversation threading for back-and-forth messages (future enhancement)
- [ ] Add response sentiment analysis (positive, neutral, negative) (future enhancement)


---

## GITHUB ENHANCEMENTS: Lightweight & Powerful Upgrades

### Phase 1: BullMQ Message Queue
- [x] Install bullmq and redis dependencies
- [x] Create in-memory queue service (BullMQ-compatible API)
- [x] Add message worker with rate limiting per platform
- [x] Replace direct message sending with queue-based sending
- [x] Add job monitoring and event listeners
- [x] Implement retry logic with exponential backoff
- [x] Add job prioritization by compatibility score

### Phase 2: Crawlee Web Scraping
- [x] Install crawlee and playwright dependencies
- [x] Create Crawlee-powered Nationale Hulpgids scraper
- [x] Add anti-detection features (fingerprints, TLS replication)
- [x] Implement automatic session management
- [x] Add proxy rotation support
- [x] Ready for migration of other platform scrapers to Crawlee
- [ ] Test scraping reliability with real credentials

### Phase 3: rate-limiter-flexible
- [x] Install rate-limiter-flexible dependency
- [x] Create rate limiter service with per-platform limits
- [x] Create rate limiter middleware for tRPC
- [x] Add per-platform rate limits in scrapers (10-20 req/min)
- [x] Add per-user API rate limits (100 req/min)
- [x] Implement block strategy for DoS protection
- [x] Add message rate limiting (5-10 msg/min per platform)
- [x] Add authentication rate limiting (5 attempts/15min)

### Phase 4: Integration & Testing
- [x] Update tRPC procedures to use message queue
- [x] Add queue stats endpoint for monitoring
- [x] Integrate rate limiting with queue workers
- [ ] Write vitest tests for queue, scraper, rate limiter
- [ ] Test end-to-end flow with all enhancements
- [ ] Update documentation with new features


---

## NEXT ENHANCEMENTS: Redis + Crawlee Migration + Dashboard

### Phase 1: Redis Support for Production
- [ ] Add Redis connection with automatic fallback to in-memory queue
- [ ] Create hybrid queue service that detects Redis availability
- [ ] Update BullMQ integration to use Redis when available
- [ ] Add Redis health check endpoint
- [ ] Test queue persistence and recovery with Redis
- [ ] Document Redis setup for production deployment

### Phase 2: Migrate All Platform Scrapers to Crawlee
- [x] Create Crawlee scraper for Indeed
- [x] Create Crawlee scraper for PGBvacatures
- [x] Create Crawlee scraper for Zorgbanen
- [x] Create Crawlee scraper for Jobbird
- [x] Add platform-specific anti-detection configurations
- [x] Test all scrapers with mock data
- [x] Update platformScraper.ts to use Crawlee scrapers

### Phase 3: Queue Monitoring Dashboard
- [x] Create QueueMonitor page component
- [x] Add real-time queue statistics display
- [x] Show job status breakdown (waiting, active, completed, failed, delayed)
- [x] Add visual progress bars for queue distribution
- [x] Display success/failure rates per platform
- [x] Add queue health status indicators
- [x] Create visual charts for queue health metrics
- [x] Add navigation link to Queue Monitor in sidebar
- [x] Add route to App.tsx
- [x] Implement auto-refresh functionality (every 3 seconds)
