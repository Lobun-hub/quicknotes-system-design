# QuickNotes System Design

QuickNotes is a small browser client that demonstrates loading, creating, and
deleting notes with the JSONPlaceholder practice API, alongside backend design
documents for a real notes service intended to scale to one million users.

## Run the API client

1. Clone the repository and open its root folder.
2. Start a local static web server from that folder, for example:

   ```sh
   python -m http.server 8000
   ```

3. Open <http://localhost:8000> in a browser and choose **Load notes**.
   Creating and deleting notes sends POST and DELETE requests to
   JSONPlaceholder; those writes are simulated by the practice API and are not
   persisted on its server. The client updates its local page state for the
   current session.

The client uses the public JSONPlaceholder endpoint and therefore needs an
internet connection. No backend service or package installation is required.

## Design documents

- [API design](docs/api-design.md)
- [Data model](docs/data-model.md)
- [Architecture](docs/architecture.md)

## What I learned

- A browser API client needs clear loading, success, empty, and error states,
  as well as input validation and controls that prevent duplicate requests.
- Rendering untrusted API values with `textContent` avoids interpreting user
  text as HTML.
- A relational model with ownership constraints and a join table supports
  consistent many-to-many tagging.
- Caches and read replicas improve read scale, but introduce freshness and
  invalidation trade-offs that need explicit handling.
