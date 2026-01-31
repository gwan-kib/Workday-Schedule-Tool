Not affiliated with or endorsed by Workday

# Workday – Schedule Tool

A Chrome extension that allows students to **extract, visualize, and export their course schedules from Workday** into a clean and usable format.

---

## Features

- **Schedule View**  
  Visualize courses in a calendar-style grid layout directly inside the extension panel.

- **Filtering & Sorting**  
  Filter courses by attributes such as course code, name, and credits (when available).

- **Schedule Snapshots**  
  Save multiple schedule versions locally to compare different registration scenarios.

- **Calendar Export (`.ics`)**  
  Export schedules as RFC 5545-compatible `.ics` files for Google Calendar, Apple Calendar, Outlook, and other calendar clients.

---


## How It Works

1. **Content Script Injection**  
   A content script initializes when a Workday page loads.

2. **Grid Detection & Parsing**  
   The script locates Workday’s course grid and extracts structured data from table rows.

3. **Data Extraction**  
   Course codes, names, instructors, meeting patterns, dates, and credits are parsed and normalized using DOM traversal and regex utilities.

4. **UI Rendering**  
   An interactive extension panel is mounted into a **Shadow DOM** to avoid style conflicts with the host page.

5. **State Management**  
   A centralized state object coordinates filtering, sorting, view switching, and exports.

6. **Calendar Export**  
   Schedule data is converted into a valid `.ics` file with recurring events and basic timezone awareness.

---

## What I Learned Building This

### Architecture & JavaScript

- **Chrome Extension Architecture**: Manifest v3 configuration, content scripts, background service workers, and communication between different extension contexts
- **Shadow DOM & DOM Manipulation**: Mounting UI into Shadow DOM to prevent style conflicts with host page, dynamic DOM updates with efficient rendering
- **Reactive State Management**: Built a centralized STATE object pattern to manage application state and trigger reactive updates across the UI
- **Event Handling & Debouncing**: Implemented debounced event listeners to optimize performance during frequent user interactions

### Web Scraping & Data Processing

- **DOM Parsing**: Built grid parsing logic to extract structured data from HTML tables
- **Text Normalization**: Handled messy Workday data with regex patterns and text parsing utilities to extract meeting times, dates, instructors, and course codes
- **Data Transformation**: Converted raw course data into structured objects with proper typing and validation

### Calendar & Time Handling

- **iCalendar Format (RFC 5545)**: Generated valid `.ics` files with proper timezone handling, recurring events (RRULE), and UTC/local time conversions
- **Date Manipulation**: Date parsing and formatting for multiple calendar systems and timezone awareness

### UI/UX Development

- **Component-Based UI**: Built reusable UI components (buttons, links) for the different extension panel views (course list, schedule grid, settings, help)
- **CSS Architecture**: Organized styling into logical modules (colours, formatting, themes) with CSS variables for maintainability
- **Responsive Design**: Created an interface that works within Chrome's extension constraints

### Development Practices

- **Debugging**: Implemented custom debug utilities for efficient logging across the extension

---

## How To Run Locally

### 1. Clone the repository
```bash
git clone https://github.com/gwan-kib/Workday-Extension.git
cd Workday-Extension
```

### 2. Install dependencies
```bash
npm install
```

This project uses **multiple Vite configurations**:

- `vite.content.config.js` – Bundles content scripts injected into Workday pages  
- `vite.background.config.js` – Bundles the background service worker

### 3. Build the extension
```bash
npm run build
```

### 4. Load into Chrome
1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the project root directory

### 5. Use the extension
Navigate to any Workday instance matching:

```
https://*.myworkday.com
```

---

## Project Structure

```text
├── dist/                     # Built extension assets (updated after npm run build)
├── src/
│   ├── background.js            # Service worker
│   ├── content.js               # Workday page injector + orchestration
│   ├── popup.html               # Extension popup markup
│   ├── popup.css                # Extension popup styles
│   ├── panel.html               # In-page panel markup
│   ├── core/                    # Global state management
│   ├── extraction/              # Course data parsing from Workday
│   │   ├── parsers/                # Specialized parsers (meeting patterns, instructors, sections)
│   │   ├── grid.js                 # Workday table structure analysis
│   │   ├── rowCellReader.js        # Structured row parsing helpers
│   │   └── extractCourses.js       # Primary extraction entry point
│   ├── mainPanel/               # UI rendering & interactions
│   │   ├── loadMainPanel.js        # Panel bootstrap logic
│   │   ├── renderCourseRows.js     # Course list rendering
│   │   ├── scheduleStorage.js      # Schedule snapshots (save/load)
│   │   └── scheduleView.js         # Calendar grid visualization
│   ├── exportLogic/             # iCalendar generation
│   ├── utilities/               # Shared helpers (DOM, Shadow DOM, debugging)
│   └── css/                     # Styling (colors, formatting, themes)
├── manifest.json             # Chrome extension manifest
├── vite.background.config.js # Vite build for background script
└── vite.content.config.js    # Vite build for content script
```

---

## Permissions & Privacy

- Access is limited to `*.myworkday.com`
- All data is stored locally using `chrome.storage.local`
- **No external servers or third-party APIs**
- No user data is transmitted off the device

---

## Browser Support

- Chrome 88+ (Manifest V3 required)

---

## License

ISC

---

**Built as a learning project to explore Chrome extension development, DOM parsing, and UI/UX design while building a solution I’m intimately familiar with**
