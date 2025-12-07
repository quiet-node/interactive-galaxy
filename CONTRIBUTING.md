# Contributing to Interactive Galaxy Between Hands

First off, thank you for considering contributing to this project! 🌟

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check existing issues to avoid duplicates. When you create a bug report, include as many details as possible:

- **Use a clear and descriptive title**
- **Describe the exact steps to reproduce the problem**
- **Provide specific examples to demonstrate the steps**
- **Describe the behavior you observed and what you expected**
- **Include screenshots or animated GIFs if relevant**
- **Mention your browser, OS, and hardware specs**

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion:

- **Use a clear and descriptive title**
- **Provide a detailed description of the suggested enhancement**
- **Explain why this enhancement would be useful**
- **List any alternative solutions you've considered**

### Pull Requests

1. Fork the repo and create your branch from `main`
2. Make your changes following our coding standards
3. Test your changes thoroughly
4. Update documentation if needed
5. Ensure the build passes: `npm run build`
6. Ensure type checking passes: `npm run typecheck`
7. Create a Pull Request with a clear description

## Development Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/mediapipe-for-fun.git
cd mediapipe-for-fun

# Install dependencies
npm install

# Start development server
npm run dev
```

## Coding Standards

### TypeScript

- Use TypeScript strict mode (already configured)
- Provide type annotations for public APIs
- Avoid `any` types - use `unknown` if truly needed
- Document complex type definitions

### Code Style

- Use clear, descriptive variable and function names
- Write comments for complex logic
- Keep functions small and focused (Single Responsibility Principle)
- Use async/await instead of promise chains
- Prefer const over let, never use var

### File Organization

- One class/component per file
- Group related types in `types/` directories
- Keep utilities pure and testable
- Separate concerns (UI, business logic, rendering)

### Performance

- Use object pooling for frequently created objects
- Prefer GPU operations over CPU when possible
- Profile before optimizing (don't guess)
- Consider mobile/lower-end devices

### Documentation

- Add JSDoc comments to public APIs
- Update README.md for user-facing changes
- Document architectural decisions in code comments
- Keep design docs (docs/) up to date

## Commit Messages

Write clear commit messages:

```
feat: add gravitational wave effect
fix: correct hand tracking jitter at high FPS
docs: update performance benchmarks
refactor: simplify particle pooling logic
perf: optimize shader compilation
```

Prefixes:

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation only
- `style`: Code style (formatting, no logic change)
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `perf`: Performance improvement
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

## Code Review Process

1. Maintainers will review your PR
2. Address any feedback or requested changes
3. Once approved, your PR will be merged
4. Your contribution will be acknowledged in releases

## Community

- Be respectful and constructive
- Help others when you can
- Share your knowledge
- Celebrate improvements, no matter how small

## Questions?

Feel free to open an issue with the `question` label or reach out to the maintainers.

Thank you for contributing! 🎉✨
