# Luke's notebook

A small personal site for thoughts and travel, hosted at <https://luke-yuan.github.io>.
Eleventy turns Markdown into static HTML. GitHub Actions publishes each change to `master`.

## Write, edit, or delete

Open <https://luke-yuan.github.io/manage/> and sign in to GitHub when prompted.

- **New post:** choose a dated filename such as `2026-09-22-a-small-note.md`,
  edit the title and body, and commit directly to `master`.
- **Edit About:** update the text in `src/index.md` and commit.
- **Edit / Delete:** choose the action next to a published note and commit the change in GitHub.

The site updates after the **Publish site** workflow succeeds, usually within a few minutes.
The Manage page is public, but GitHub requires repository write access to publish or delete.
Deleting a post removes it from the current website; it stays in the repository's Git history.

## Post format

Create posts inside `src/posts/`. Use real dates in `YYYY-MM-DD-short-title.md` filenames;
the filename supplies the date. Notes are listed newest first.

```markdown
---
title: A small note
---

Something I want to remember.

## A heading

You can use **bold**, *italics*, and [links](https://example.com).
```

Keep titles on one line. Quote a title if it contains a colon, for example
`title: "Tokyo: day one"`. Use unique filenames. Everything in `src/posts/` is public;
keep unfinished drafts outside that folder.

For a photo, use **Upload photos** on the Manage page to upload it to `src/assets/`,
then include `![Description](/assets/photo.jpg)` in a post. JPG, PNG, GIF, and WebP
work. Use filenames without spaces and resize large photos before uploading.
Images automatically fit the page on phones and larger screens.

## Local preview

Install Node.js 22 or newer, then:

```sh
npm ci
npm run dev
```

Open <http://localhost:8080>. Run `npm run build` to generate `_site/`.
The preview watches edits. After deleting a post locally, restart the preview with
`npm run build` or `npm run dev` to clear old output. Deployments always use a fresh build.

## Hosting

In the repository's **Settings → Pages**, set the source to **GitHub Actions**.
The workflow in `.github/workflows/pages.yml` publishes the site automatically.
Check the repository's **Actions** tab if an update does not appear.

Site name and repository links live in `src/_data/site.json`. Page styles live in
`src/assets/style.css`. This configuration serves from the root of `luke-yuan.github.io`.
