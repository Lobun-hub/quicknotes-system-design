# QuickNotes REST API design

## Conventions

The production API is served over HTTPS under `/v1`. Requests and responses use
JSON unless a response has no body. Private endpoints require
`Authorization: Bearer <access-token>`. Timestamps are UTC ISO 8601 strings.
Note and tag identifiers are opaque UUIDs. Lists use cursor pagination and
return at most 100 items per page.

## Endpoints

| Method | Path | Description | Success status |
| --- | --- | --- | --- |
| `POST` | `/v1/users` | Register a user account. | `201 Created` |
| `POST` | `/v1/auth/token` | Exchange valid credentials for an access token. | `200 OK` |
| `GET` | `/v1/notes` | List the authenticated user's notes; supports `limit` and `cursor`. | `200 OK` |
| `POST` | `/v1/notes` | Create a note for the authenticated user. | `201 Created` |
| `GET` | `/v1/notes/{noteId}` | Retrieve one of the authenticated user's notes. | `200 OK` |
| `PATCH` | `/v1/notes/{noteId}` | Update the supplied title and/or body fields. | `200 OK` |
| `DELETE` | `/v1/notes/{noteId}` | Delete one of the authenticated user's notes. | `204 No Content` |
| `GET` | `/v1/tags` | List tags owned by the authenticated user. | `200 OK` |
| `PUT` | `/v1/notes/{noteId}/tags/{tagId}` | Associate an existing tag with a note. | `204 No Content` |
| `DELETE` | `/v1/notes/{noteId}/tags/{tagId}` | Remove a tag association from a note. | `204 No Content` |

All note operations are scoped to the authenticated user. A note belonging to
another user is not exposed; a request for it returns `404 Not Found`.

## Create a note

Request:

```http
POST /v1/notes HTTP/1.1
Authorization: Bearer eyJ...
Content-Type: application/json
```

```json
{
  "title": "Meeting notes",
  "body": "Send the follow-up by Friday."
}
```

The title is required, trimmed, and limited to 100 characters. The body is
optional and may be an empty string.

Response (`201 Created`):

```json
{
  "data": {
    "id": "8f2e7752-c04d-4a6f-882c-7fc4ca97b305",
    "title": "Meeting notes",
    "body": "Send the follow-up by Friday.",
    "createdAt": "2026-10-11T19:30:00Z",
    "updatedAt": "2026-10-11T19:30:00Z",
    "tags": []
  }
}
```

The server assigns the ID and timestamps and associates the note with the user
from the token; clients cannot set another user's `userId`.

## List notes

Request:

```http
GET /v1/notes?limit=2 HTTP/1.1
Authorization: Bearer eyJ...
```

Response (`200 OK`):

```json
{
  "data": [
    {
      "id": "8f2e7752-c04d-4a6f-882c-7fc4ca97b305",
      "title": "Meeting notes",
      "body": "Send the follow-up by Friday.",
      "createdAt": "2026-10-11T19:30:00Z",
      "updatedAt": "2026-10-11T19:30:00Z",
      "tags": []
    },
    {
      "id": "a45a7202-e6c8-441f-9d2e-9746709e4fc2",
      "title": "Shopping list",
      "body": "Coffee, oats, apples",
      "createdAt": "2026-10-10T16:12:00Z",
      "updatedAt": "2026-10-10T16:12:00Z",
      "tags": ["Personal"]
    }
  ],
  "page": {
    "nextCursor": "eyJ1cGRhdGVkQXQiOi...",
    "hasMore": true
  }
}
```

## Errors

Errors use a consistent JSON envelope and do not include stack traces or
database details. The API can return these status codes:

| Status | Meaning |
| --- | --- |
| `400 Bad Request` | Malformed JSON, invalid fields, or invalid pagination cursor. |
| `401 Unauthorized` | Missing, invalid, or expired access token. |
| `403 Forbidden` | The caller is authenticated but lacks permission for the operation. |
| `404 Not Found` | The resource does not exist or is not visible to the caller. |
| `409 Conflict` | A unique value, such as a user's email, is already in use. |
| `413 Content Too Large` | The request exceeds the documented payload limit. |
| `429 Too Many Requests` | The caller exceeded a rate limit. |
| `500 Internal Server Error` | An unexpected server-side failure occurred. |

Example (`400 Bad Request`):

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "The request contains invalid fields.",
    "details": [
      {
        "field": "title",
        "message": "Title is required and must be 100 characters or fewer."
      }
    ],
    "requestId": "req_01J9Q2K4F7"
  }
}
```

Clients should use the stable `code` and `details` fields for expected error
handling and treat `message` as user-facing text.
