# Batman Study Analytics - Architecture Diagram

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         END USER BROWSER                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌────────────────────────────────────┐                             │
│  │   Batman Study React App           │                             │
│  │   (Served via CloudFront)          │                             │
│  │                                    │                             │
│  │  ┌──────────────────────────────┐  │                             │
│  │  │   Play Button Click          │  │                             │
│  │  │   (User Interaction)         │  │                             │
│  │  └────────────┬─────────────────┘  │                             │
│  └───────────────┼────────────────────┘                             │
│                  │                                                    │
│                  │ Fetch POST /track                                 │
│                  │ (with IP from headers)                            │
│                  ▼                                                    │
└─────────────────────────────────────────────────────────────────────┘
                    │
                    │ HTTPS
                    │
┌─────────────────────────────────────────────────────────────────────┐
│                        AWS CLOUD                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌────────────────────────────────────────────────────────────┐    │
│  │              API GATEWAY (HTTP API)                        │    │
│  │                                                            │    │
│  │  ┌─────────────────────────────────────────────────────┐  │    │
│  │  │ POST /track                                         │  │    │
│  │  │ GET /analytics                                      │  │    │
│  │  │ CORS: * (All Origins)                               │  │    │
│  │  │ CloudWatch Logging: Enabled                         │  │    │
│  │  └────────┬──────────────────────────────────┬─────────┘  │    │
│  │           │                                  │            │    │
│  │           ▼                                  ▼            │    │
│  │    ┌─────────────┐              ┌────────────────┐        │    │
│  │    │ trackPlay   │              │ getAnalytics   │        │    │
│  │    │ Click       │              │                │        │    │
│  │    │ Lambda      │              │ Lambda         │        │    │
│  │    │             │              │                │        │    │
│  │    │ - Extract   │              │ - Scan all     │        │    │
│  │    │   IP addr   │              │   records      │        │    │
│  │    │ - Get/Put   │              │ - Aggregate    │        │    │
│  │    │   record    │              │   stats        │        │    │
│  │    │ - Update    │              │ - Sort by      │        │    │
│  │    │   counts    │              │   click count  │        │    │
│  │    └──────┬──────┘              └────────┬───────┘        │    │
│  └───────────┼──────────────────────────────┼────────────────┘    │
│              │                              │                      │
│              │                              │                      │
│              └──────────┬───────────────────┘                      │
│                         │                                          │
│                         ▼                                          │
│        ┌─────────────────────────────────┐                        │
│        │     DynamoDB Table              │                        │
│        │  batman-play-analytics         │                        │
│        │                                 │                        │
│        │ ┌──────────────────────────┐   │                        │
│        │ │ ipAddress (PK)           │   │                        │
│        │ │ clickCount               │   │                        │
│        │ │ firstVisitedAt           │   │                        │
│        │ │ lastClickedAt            │   │                        │
│        │ │ [TTL] expiresAt          │   │                        │
│        │ │                          │   │                        │
│        │ │ Pay-Per-Request Billing  │   │                        │
│        │ │ PITR Enabled             │   │                        │
│        │ │ Streams Enabled          │   │                        │
│        │ └──────────────────────────┘   │                        │
│        └─────────────────────────────────┘                        │
│                                                                    │
│  ┌──────────────────────┐      ┌──────────────────────┐         │
│  │ CloudWatch Logs      │      │ CloudWatch Logs      │         │
│  │                      │      │                      │         │
│  │ /aws/lambda/track    │      │ /aws/apigateway/     │         │
│  │                      │      │ analytics-api        │         │
│  │ (Lambda logs)        │      │                      │         │
│  │                      │      │ (API access logs)    │         │
│  └──────────────────────┘      └──────────────────────┘         │
│                                                                   │
└────────────────────────────────────────────────────────────────────┘
```

## Data Flow Sequence

### Play Button Click Flow

```
1. User clicks Play button
   │
   ▼
2. Browser JavaScript handler triggers
   │
   ├─ Pause playback (if playing) OR
   │
   ▼ Start playback
3. Send POST request to `/track` endpoint
   │
   ├─ Headers include: User-Agent, IP address
   ├─ Body: Empty JSON {}
   │
   ▼
4. API Gateway receives request
   │
   ├─ Validates CORS
   ├─ Logs to CloudWatch
   │
   ▼
5. Lambda function `trackPlayClick` invoked
   │
   ├─ Extract IP address from headers
   │ ├─ x-forwarded-for (CloudFront)
   │ ├─ x-real-ip (fallback)
   │ ├─ sourceIp (fallback)
   │
   ▼
6. Query DynamoDB for existing user record
   │
   ├─ IF record exists:
   │  ├─ Increment clickCount by 1
   │  ├─ Update lastClickedAt timestamp
   │  ├─ Keep firstVisitedAt unchanged
   │
   ├─ IF record not found:
   │  ├─ Create new record
   │  ├─ Set clickCount = 1
   │  ├─ Set firstVisitedAt = now
   │  ├─ Set lastClickedAt = now
   │
   ▼
7. Return updated record to frontend
   │
   ├─ Status: 200 OK
   ├─ Body: { success: true, data: {...} }
   │
   ▼
8. Frontend receives response
   │
   ├─ Silently logged to console
   ├─ Non-blocking (doesn't affect playback)
   │
   ▼
9. Data persisted in DynamoDB
   │
   └─ Available for analytics queries
```

### Analytics Query Flow

```
1. Admin/Dashboard requests analytics
   │
   ├─ Browser: GET /analytics
   │ OR
   ├─ CLI: curl https://api.../analytics
   │
   ▼
2. API Gateway routes to Lambda
   │
   ├─ Route: GET /analytics
   ├─ Target: getAnalytics function
   │
   ▼
3. Lambda function scans DynamoDB
   │
   ├─ Query all items
   ├─ No filters (gets everything)
   │
   ▼
4. Process results
   │
   ├─ Count total users
   ├─ Sum total clicks
   ├─ Sort users by clickCount (desc)
   ├─ Format response
   │
   ▼
5. Return analytics data
   │
   ├─ Status: 200 OK
   ├─ Body:
   │  {
   │    "totalUsers": 42,
   │    "totalClicks": 156,
   │    "users": [
   │      {
   │        "ipAddress": "203.0.113.42",
   │        "clickCount": 12,
   │        "firstVisitedAt": "2024-05-26...",
   │        "lastClickedAt": "2024-05-26..."
   │      },
   │      ...
   │    ]
   │  }
   │
   ▼
6. Client processes response
   │
   └─ Display in UI/Dashboard
```

## Component Interactions

### Frontend ↔ Backend

```
┌──────────────────────┐
│   React Component    │
│   (src/App.jsx)      │
└──────────┬───────────┘
           │
      handlePlayPause()
           │
           ├─ YouTube.playVideo()
           │
           └─ fetch(`${API_ENDPOINT}/track`)
                 │
                 │ Async, non-blocking
                 │
                 ▼
           ┌──────────────┐
           │ API Endpoint │
           │ POST /track  │
           └──────────────┘
```

### Lambda ↔ DynamoDB

```
┌────────────────────┐
│  Lambda Function   │
│  trackPlayClick    │
└──────────┬─────────┘
           │
           ├─ GetCommand({ipAddress})
           │
           ├─ UpdateCommand() or
           │  PutCommand()
           │
           ▼
     ┌─────────────┐
     │  DynamoDB   │
     │   Table     │
     └─────────────┘
           │
           ├─ Single record per IP
           │
           ├─ Auto-scale reads/writes
           │
           └─ TTL cleanup (optional)
```

## Infrastructure Layers

```
┌─────────────────────────────────────────────────────────┐
│  Layer 4: Presentation                                   │
│  ├─ React Components                                     │
│  ├─ User Interactions                                    │
│  └─ Browser JavaScript                                  │
└────────────────────┬────────────────────────────────────┘
                     │
┌─────────────────────────────────────────────────────────┐
│  Layer 3: API / Integration                             │
│  ├─ API Gateway (HTTP API)                              │
│  ├─ CORS Handling                                       │
│  ├─ Request Routing                                     │
│  └─ CloudWatch Logging                                  │
└────────────────────┬────────────────────────────────────┘
                     │
┌─────────────────────────────────────────────────────────┐
│  Layer 2: Business Logic                                │
│  ├─ Lambda: trackPlayClick()                            │
│  ├─ Lambda: getAnalytics()                              │
│  ├─ IP Extraction                                       │
│  └─ Data Processing                                     │
└────────────────────┬────────────────────────────────────┘
                     │
┌─────────────────────────────────────────────────────────┐
│  Layer 1: Data Storage                                  │
│  ├─ DynamoDB Table                                      │
│  ├─ Record Structure                                    │
│  ├─ Indexing (by IP address)                           │
│  └─ Backup & Recovery                                   │
└─────────────────────────────────────────────────────────┘
```

## Security Boundaries

```
                    HTTPS/TLS Boundary
                           │
        ┌────────────────────────────────────────┐
        │      Browser/CloudFront Edge           │
        │  (Public, User Accessible)             │
        └──────────────┬───────────────────────────┘
                       │
                    HTTPS/TLS Boundary
                       │
        ┌──────────────────────────────────────────┐
        │      API Gateway / Lambda               │
        │  (AWS-Managed, Rate-Limited)             │
        │  IAM Role: Least Privilege               │
        └────────────┬─────────────────────────────┘
                     │
              DynamoDB Access Boundary
                     │
        ┌──────────────────────────────────────────┐
        │      DynamoDB Table                      │
        │  (Private, No Direct Internet Access)    │
        │  Encryption at Rest & Transit            │
        │  Access: Only Lambda Role                │
        └──────────────────────────────────────────┘
```

## Scaling Characteristics

### User Growth Impact

```
Users (per month)  | DynamoDB Cost | Lambda Cost | API GW Cost
───────────────────┼───────────────┼─────────────┼───────────
100                | <$0.10        | Free        | Free
1,000              | <$0.50        | Free        | Free
10,000             | <$2.00        | Free        | <$0.50
100,000            | <$15.00       | <$5.00      | <$5.00
1,000,000          | <$150.00      | <$50.00     | <$50.00
```

**Key**: PAY_PER_REQUEST billing means costs scale linearly with usage. No surprise bills possible.

---

For deployment instructions, see [DEPLOYMENT.md](DEPLOYMENT.md)
For detailed technical docs, see [ANALYTICS.md](ANALYTICS.md)
