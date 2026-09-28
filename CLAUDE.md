# Claude Code Instructions — Rex Comicsverse

This file tells Claude Code exactly what to do when you open this project.

## Project
Rex Comicsverse — Indian superhero comic platform
Main site: index.html | Guide: setup-guide.html

## When I say "deploy" — do this:
1. Check if git is initialized, if not: git init
2. Add all files: git add .
3. Commit: git commit -m "Update Rex Comicsverse"
4. Push to GitHub: git push origin main
5. Tell me the live URL

## When I say "run locally" — do this:
1. Check if Python is available
2. Run: python3 -m http.server 8080
3. Tell me to open: http://localhost:8080

## When I say "setup Firebase" — do this:
1. Ask me for my Firebase config keys
2. Find the placeholder text in index.html
3. Replace all 6 placeholder values with my real values
4. Save the file

## When I say "add my comic" — do this:
1. Ask me for the episode number, title, and image files
2. Find the EPISODES array in index.html
3. Add the new episode with my details
4. Save and deploy

## When I say "change logo" — do this:
1. Ask me for the logo image file path
2. Convert it to base64 or get the URL
3. Update the logo in the HTML
4. Save and deploy

## Important files:
- index.html = the entire website (all pages in one file)
- manifest.json = PWA/Android app config
- sw.js = offline support
- setup.sh = auto deployment script
