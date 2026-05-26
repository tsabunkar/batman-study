import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  UpdateCommand,
  PutCommand,
  ScanCommand,
} from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || "batman-play-analytics";

// Extract IP address from Lambda event
const getClientIp = (event) => {
  const headers = event.headers || {};
  return (
    headers["x-forwarded-for"]?.split(",")[0].trim() ||
    headers["x-real-ip"] ||
    headers["client-ip"] ||
    event.requestContext?.http?.sourceIp ||
    event.requestContext?.identity?.sourceIp ||
    "unknown"
  );
};

// Track play button click
export const trackPlayClick = async (event) => {
  try {
    const ipAddress = getClientIp(event);
    const now = new Date().toISOString();

    // Get existing user record
    const getParams = {
      TableName: TABLE_NAME,
      Key: { ipAddress },
    };

    const existingRecord = await docClient.send(new GetCommand(getParams));

    let response;

    if (existingRecord.Item) {
      // Update existing record
      const updateParams = {
        TableName: TABLE_NAME,
        Key: { ipAddress },
        UpdateExpression:
          "SET clickCount = clickCount + :inc, lastClickedAt = :now",
        ExpressionAttributeValues: {
          ":inc": 1,
          ":now": now,
        },
        ReturnValues: "ALL_NEW",
      };

      const updatedRecord = await docClient.send(
        new UpdateCommand(updateParams),
      );
      response = updatedRecord.Attributes;
    } else {
      // Create new record
      const newRecord = {
        ipAddress,
        clickCount: 1,
        firstVisitedAt: now,
        lastClickedAt: now,
      };

      const putParams = {
        TableName: TABLE_NAME,
        Item: newRecord,
      };

      await docClient.send(new PutCommand(putParams));
      response = newRecord;
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        success: true,
        message: "Click tracked successfully",
        data: response,
      }),
    };
  } catch (error) {
    console.error("Error tracking click:", error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        success: false,
        message: "Failed to track click",
        error: error.message,
      }),
    };
  }
};

// Get all analytics data
export const getAnalytics = async (event) => {
  try {
    const scanParams = {
      TableName: TABLE_NAME,
    };

    const result = await docClient.send(new ScanCommand(scanParams));

    const analytics = {
      totalUsers: result.Items?.length || 0,
      totalClicks: (result.Items || []).reduce(
        (sum, item) => sum + item.clickCount,
        0,
      ),
      users: (result.Items || [])
        .sort((a, b) => b.clickCount - a.clickCount)
        .map((item) => ({
          ipAddress: item.ipAddress,
          clickCount: item.clickCount,
          firstVisitedAt: item.firstVisitedAt,
          lastClickedAt: item.lastClickedAt,
        })),
    };

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        success: true,
        data: analytics,
      }),
    };
  } catch (error) {
    console.error("Error fetching analytics:", error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        success: false,
        message: "Failed to fetch analytics",
        error: error.message,
      }),
    };
  }
};

// CORS preflight handler
export const corsHandler = async (event) => {
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
    body: JSON.stringify({ message: "OK" }),
  };
};
