const fs = require('fs');
const path = require('path');

const circuitsData = fs.readFileSync(path.resolve(__dirname, './circuits-data.js'), 'utf8');
const circuitRoutes = fs.readFileSync(path.resolve(__dirname, './circuit-routes.js'), 'utf8');
let scriptContent = fs.readFileSync(path.resolve(__dirname, './script.js'), 'utf8');

scriptContent = scriptContent.replace(/function showToast/g, 'window.showToast = showToast; function showToast');

describe('showToast', () => {
  beforeEach(() => {
    document.documentElement.innerHTML = fs.readFileSync(path.resolve(__dirname, './index.html'), 'utf8');
    window.requestAnimationFrame = jest.fn();
    jest.useFakeTimers();
    eval(circuitsData + '\n' + circuitRoutes + '\n' + scriptContent);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('adds "show" class, sets text, and removes "show" after 2300ms', () => {
    const toast = document.querySelector('#toast');
    window.showToast('Test Message');

    expect(toast.textContent).toBe('Test Message');
    expect(toast.classList.contains('show')).toBe(true);

    jest.advanceTimersByTime(2299);
    expect(toast.classList.contains('show')).toBe(true);

    jest.advanceTimersByTime(1);
    expect(toast.classList.contains('show')).toBe(false);
  });

  it('clears previous timer if called multiple times', () => {
    const toast = document.querySelector('#toast');
    window.showToast('Message 1');
    jest.advanceTimersByTime(1000); // 1000ms elapsed, 1300ms left
    expect(toast.textContent).toBe('Message 1');

    window.showToast('Message 2'); // Starts a new 2300ms timer
    expect(toast.textContent).toBe('Message 2');

    jest.advanceTimersByTime(1500);
    // Total time since first toast: 2500ms
    // If previous timer was not cleared, 'show' class would be removed now.
    expect(toast.classList.contains('show')).toBe(true);

    jest.advanceTimersByTime(800); // 2300ms elapsed since second toast
    expect(toast.classList.contains('show')).toBe(false);
  });
});
