# Senet 🎲

## Content

Welcome to [Senet](https://senet.demo.sudorgin.com), a modern eCommerce platform dedicated to board game enthusiasts.

- [Overview and Purpose](#overview-and-purpose)
- [Technical Stack](#technical-stack)
- [Installation](#installation)
- [Available Scripts](#available-scripts)
- [Project Team](#project-team)

## Overview and Purpose

Senet is designed to provide a smooth and enjoyable shopping experience, allowing users to explore a wide variety of board games from the comfort of their own home. Whether you're into strategy, party games, or family favorites, our platform helps you discover the perfect game for any occasion.

From browsing to checkout, every step is optimized for convenience and clarity. Users can view detailed product descriptions, filter by genre or difficulty, and easily add games to their cart. 🛒

At Senet, we believe in the power of play to connect people. Our goal is to make choosing and purchasing board games as enjoyable as playing them.

## Technical Stack

- **Frontend**: Built with [TypeScript](https://www.typescriptlang.org/), [Vue](https://vuejs.org/), and [PrimeVue](https://primevue.org/), the application delivers a responsive and visually appealing user interface. Vue Router ensures smooth navigation across pages, while [Tailwind CSS](https://tailwindcss.com/) provides utility-first styling for rapid and consistent UI development.

- **Forms & Validation**:
  Uses [@primevue/forms](https://www.primefaces.org/primevue/forms) for reactive form handling with built-in support for validation, and [Yup](https://github.com/jquense/yup) for schema-based form validation. This ensures a consistent and scalable approach to managing form state and validation rules across the app.

  - **Icons**:
    All UI icons are provided by [PrimeIcons](https://www.primefaces.org/primevue/icons), ensuring visual consistency and easy customization of components.

- **State Management**: Managed with [Pinia](https://pinia.vuejs.org/), the intuitive and modular store for Vue, offering a lightweight and type-safe way to manage application state.

- **Data Management**: Powered by [TanStack Query](https://tanstack.com/), enabling efficient and scalable data fetching, caching, and synchronization across the application.

- **Bundling & Dev Server**: Uses [Vite](https://vite.dev/) for fast build times, instant hot module replacement, and an optimized developer experience.

- **Backend Integration**: Seamlessly connected with [Commerce Tools](https://docs.commercetools.com/docs), a modern commerce API platform that supports flexible and headless eCommerce architecture.

- **CI/CD**: Automated with [GitHub Actions](https://github.com/features/actions) and deployed via [Netlify](https://www.netlify.com/), ensuring reliable continuous integration and hassle-free delivery with each code update.

- **Code Quality & Formatting**: Maintained using [Husky](https://typicode.github.io/husky/)for Git hooks,[ESLint](https://eslint.org/) for code linting, and [Prettier](https://prettier.io/) for consistent formatting across the codebase and [Commitlint](https://commitlint.js.org/) to enforce conventional commit messages for a clean and structured Git history.

- **Testing**: Ensures application reliability with [Vitest](https://vitest.dev/) for unit and integration tests, providing a robust and fast testing environment tailored for modern frontend frameworks.

## Installation

1. Clone the repo

```sh
  git clone https://github.com/Zilusion/senet.git
```

2. install PNPM package manager (if not installed)

```sh
  npm install -g pnpm@latest-10
```

3. Install packages

```sh
  pnpm install
```

4. Start project

```sh
  pnpm dev
```

## Available Scripts

- `pnpm dev`: Starts the Vite development server for local development with hot module replacement.
- `pnpm dev:demo`: Starts the self-contained portfolio demo without commercetools credentials.
- `pnpm build`: Performs TypeScript project build using vue-tsc and then compiles the project with Vite for production.
- `pnpm build:demo`: Builds the self-contained portfolio demo.
- `pnpm generate:demo`: Regenerates the local demo catalogue from the preserved source dataset.
- `pnpm preview`: Serves the production build locally to preview the deployed version of the app.
- `pnpm prepare`: Runs Husky setup to enable Git hooks for enforcing code quality checks.
- `pnpm test`: Executes all tests using Vitest in a Node environment.
- `pnpm coverage`: Runs tests with Vitest and generates a code coverage report.
- `pnpm lint`: Lints the entire codebase using ESLint and automatically fixes fixable issues.
- `pnpm format`: Formats all supported files using Prettier.

## Project Team

- Bogdan Nurgatin - team lead (GitHub: [ketrololz](https://github.com/ketrololz))
- Daniil Sudorgin - frontend developer (GitHub: [zilusion](https://github.com/zilusion))
- Anna Yaroshenko - frontend developer (GitHub: [YaroshenkoAnna](https://github.com/yaroshenkoanna))
