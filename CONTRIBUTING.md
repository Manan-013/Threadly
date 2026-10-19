# Contributing to Threadly

Thank you for your interest in contributing to Threadly! We welcome contributions from developers of all skill levels.

---

## Code of Conduct

We are committed to providing a welcoming, inclusive, and harassment-free environment for everyone. Please be respectful, constructive, and collaborative in all communications.

---

## How to Contribute

### 1. Reporting Bugs
- Search existing GitHub Issues before submitting a new report.
- Include clear steps to reproduce the issue, your operating system, Node.js version, and Chrome version.
- Include browser console logs or backend terminal errors if applicable.

### 2. Suggesting Enhancements
- Open a GitHub Issue describing the feature or enhancement.
- Explain the user problem it solves and why it benefits Threadly users.

### 3. Pull Requests
1. **Fork** the repository and clone your fork locally:
   ```bash
   git clone https://github.com/<your-username>/threadly.git
   cd threadly
   ```
2. **Create a branch** for your feature or bugfix:
   ```bash
   git checkout -b feature/my-new-feature
   ```
3. **Install dependencies**:
   ```bash
   cd backend && npm install
   cd ../dashboard && npm install
   ```
4. **Make your changes** and test locally.
5. **Verify the dashboard build**:
   ```bash
   cd dashboard
   npm run build
   ```
6. **Commit your changes** using descriptive commit messages:
   ```bash
   git commit -m "feat(extension): add support for dark mode toggle in Gmail sidecar"
   ```
7. **Push to your fork** and submit a **Pull Request** against the `main` branch.

---

## Project Structure & Conventions

- **Backend (`backend/src/`)**: Pure Node.js + Express with an embedded SQLite database (`node:sqlite`). Keep business logic modularized in `engine.js` and database schemas in `db.js`.
- **Dashboard (`dashboard/src/`)**: React 18, TypeScript, and Tailwind CSS. Avoid heavy third-party UI component libraries; prioritize clean micro-interactions and accessible semantic HTML.
- **Extension (`extension/`)**: Chrome Manifest V3. Keep content script mutations isolated to prevent conflicts with Gmail's native DOM updates.

---

## License

By contributing to Threadly, you agree that your contributions will be licensed under the project's [MIT License](LICENSE).
