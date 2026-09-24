# Apex GP — F1 Team Dashboard

Welcome to the **Apex GP F1 Team Dashboard** repository! This is a polished, data-rich interface designed for race engineers and team leadership to analyze race performance, monitor telemetry, and manage race strategy in real-time.

## 🏁 Project Overview

The Apex GP Dashboard is a responsive, single-page web application built with vanilla web technologies (HTML, CSS, JavaScript). It provides a comprehensive view of a Formula 1 race weekend, focusing on the live race experience.

Currently, it simulates a live race desk for the **Belgian Grand Prix** at Spa-Francorchamps, tracking two fictional drivers (Mara Voss and Eli Navarro) against the rest of the field.

## ✨ Features

- **Live Race Tracking:** Real-time race status, lap progress, and race clock.
- **Driver Telemetry:** Individual driver cards displaying current position, tyre compound/age, gap times, and lap times.
- **Interactive Track Map:**
  - An interactive SVG overlay on top of the official track map.
  - Live simulation of all 20 cars moving around the circuit.
  - Interactive turn markers that provide engineer notes for each corner.
  - Ability to switch to view other official F1 circuit maps.
- **Dynamic Race Strategy:** Visualizations of tyre stints (completed and planned) and pit stop windows.
- **Race Control & Weather:** Live updates on weather conditions, track temperature, and FIA race control events (flags, incidents).
- **Data Analytics:** Interactive charts comparing lap time pace, race position history, and sector splits for the team's drivers.
- **Responsive Design:** A fully responsive grid layout that adapts to different screen sizes.
- **Focus Mode:** A toggle to hide distractions and focus on the map and strategy desk.

## 🛠 Tech Stack

- **HTML5:** Semantic markup for structure and accessibility.
- **CSS3:** Custom variables, Flexbox, and CSS Grid for a modern, responsive layout. No external CSS frameworks are used.
- **Vanilla JavaScript (ES6+):** Handles state management, UI interactions, race simulation loop (`requestAnimationFrame`), and DOM manipulation. No external JS libraries or frameworks are used.
- **SVG Animation:** Used for plotting car positions and moving them along the track's motion path.

## 🚀 Getting Started

Since this project relies entirely on static files and vanilla web technologies, getting started is incredibly simple. There is no build step or package installation required.

### Prerequisites

A modern web browser (Chrome, Firefox, Safari, Edge).

### Installation & Execution

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd <repository-directory>
   ```
2. **Open `index.html`:**
   You can simply open the `index.html` file in your preferred web browser. Alternatively, you can use a local development server for a better experience (e.g., using Python, Node.js, or Live Server extension):

   *Using Python:*
   ```bash
   python -m http.server 8000
   ```
   Then navigate to `http://localhost:8000` in your browser.

## 📁 File Structure

- `index.html`: The main entry point and structural layout of the dashboard.
- `styles.css`: All styling, layout, and visual theme definitions.
- `script.js`: The core logic for the dashboard, including the race simulation loop, chart rendering, and user interactions.
- `circuits-data.js`: Contains data for various F1 circuits (names, lengths, laps).
- `circuit-routes.js`: Contains SVG path definitions for the racing lines of different circuits.
- `assets/`: Directory containing images and SVG assets (like the Spa-Francorchamps map).

## 📊 Data Disclaimer

The data presented in this dashboard is **illustrative and fictional**.
- Drivers (Mara Voss, Eli Navarro, etc.) and their telemetry are fictional.
- The lap times, gaps, and weather conditions are simulated.
- **Do not present these mock values as live, real-world F1 telemetry.**

The interactive track map utilizes official layout diagrams purely for demonstration and UI exploration purposes.
