# Store listing — English

> Source: live Firefox Add-ons listing.

## Name

Reddit Slideshow Spectacular!

## Summary

Turn your old or new Reddit feeds into a full-screen, keyboard-driven media slideshow. Free, Private, Local, No Tracking.

## Description

Reddit Slideshow Spectacular! turns your Reddit feeds into full-screen, keyboard-driven media slideshow. Open a feed, subreddit, multireddit, or search results on old.reddit.com or www.reddit.com, click the toolbar icon (or press Alt+Shift+S), and lean back.

The Slideshow reuses your existing logged-in Reddit session - no API keys, no sign-in, no extra account. It walks media posts in the order Reddit returns them and pages through the feed automatically, so the slideshow keeps going past the first page.

WHAT'S NEW - V1.4.1

- FIXED: Reddit GIFs play as video - they get a countdown bar, and the slide waits for the clip to finish instead of cutting it off
- FIXED: GIFs inside a gallery are no longer skipped
- IMPROVED: The control rail and the byline match the rest of the overlay

WHAT'S NEW - V1.4.0

- NEW: Zoom into any slide - scroll or press + / - to zoom at the pointer (the show pauses itself), then drag to pan
- NEW: Downloaded files get clean, sortable names
- IMPROVED: The settings page is organized into sections
- Various performance and bug fixes

Full release notes: https://github.com/Rio517/reddit-slideshow-spectacular/releases

WHAT IT PLAYS

- Direct Reddit images (full-resolution i.redd.it where available)
- Reddit galleries, expanded into one slide per image
- Reddit-hosted video (v.redd.it), with its sound (the separate audio track)
- Redgifs, Imgur (.gifv), Streamable, and Giphy clips, played as native video
- Imgur albums, expanded into one slide per image
- Catbox video and image files
- Crossposts, resolved to the original post's media

The queue is media-only: text/self posts, outbound article links, stickied announcements, and promoted/ad posts are skipped, and media that fails to load is skipped too - so the slideshow never lands on a dead slide.

CONTROLS

- Keyboard: Left/Right to move (Shift+Right skips to the next post; Page Up/Page Down jump back/ahead 10), Up/Down to upvote/downvote the post, Space to play/pause, M to mute, F for fullscreen, D to download, I to block the author (and skip their post), A to friend/follow the author, Esc to close
- Scroll or press + / - to zoom at the pointer (the show pauses itself, and resumes when you zoom back out); drag to pan the zoomed slide
- An on-screen control rail: previous, play/pause, next, mute, fullscreen, open in a window, and settings
- Under each slide: a byline (who posted it, to which subreddit, the source and resolution), with buttons to open the original post or download the media
- Click the position counter to jump straight to any post in the loaded queue
- Click the dark backdrop to close
- Images advance on a timer you set; the timer keeps running even after you arrow through manually, and videos advance when the clip ends

NICE TOUCHES

- Slide transitions: fade, slide, push, zoom, flip, or none
- Optional top countdown timer bar (on video slides, every slide, or never)
- Optional slow pan & zoom for images too big to see at once
- A pinned position counter and post title so you always know where you are
- "Open in a window" reopens the slideshow in a minimal popup window, ready to AirPlay or Chromecast to a TV or second screen for a lean-back, big-screen feed
- Duplicate skipping: reposts, crossposts, and repeated galleries are skipped, and a perceptual hash (on by default) also catches the same image re-uploaded under a new link - solo vs. in a gallery
- "Open original" jumps to the source post

SETTINGS (apply live, no reload)

- Time per image (1 second to 5 minutes, on a fine-at-the-low-end scale)
- Slide transition
- Timer bar visibility
- How long to wait for slow media before moving on
- Autoplay videos on/off, start muted on/off
- Include NSFW - by default follows your Reddit session, showing over-18 content only insofar as your account already does
- Skip duplicate media, including re-uploaded images (on by default)
- Download folder (inside your browser's Downloads folder)
- Pan & zoom large images (or all images), with full control over the sequence

PRIVACY

No analytics, no tracking, no ads, no accounts, and no developer servers (there are none). The extension only fetches the media you're viewing: the feed and its media from Reddit, and provider clips from Imgur, Redgifs, Streamable, Giphy, and Catbox. The only things that write to your Reddit account are voting (up/down keys), blocking an author (I), and friending/following an author (A) - each only when you press its key. Your settings are stored locally on your computer, and it ships no remote code. Full policy: see the privacy policy link.

Open source, MIT licensed.
