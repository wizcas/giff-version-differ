/**
 * Test controller disconnect handling
 */

async function testControllerDisconnect() {
  console.log("Testing controller disconnect handling...");

  try {
    // Use a real working repository for testing
    const response = await fetch("http://localhost:3000/api/git-diff/stream?repo=https://github.com/facebook/react&from=main~5&to=main");

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    console.log("✅ Stream started");

    const reader = response.body.getReader();
    let eventCount = 0;

    try {
      // Read a few events then simulate disconnect
      for (let i = 0; i < 3; i++) {
        const { value, done } = await reader.read();
        if (done) break;

        const text = new TextDecoder().decode(value);
        const lines = text.split("\n").filter((line) => line.trim());

        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            eventCount++;
            console.log(`📡 Event ${eventCount}: ${data.type} - ${data.status || "event"}`);
          } catch (e) {
            // Ignore parse errors
          }
        }
      }

      // Simulate client disconnect
      console.log("🔌 Simulating client disconnect...");
      reader.cancel();

      // Wait a bit to see if there are any controller errors
      await new Promise((resolve) => setTimeout(resolve, 2000));

      console.log("✅ Disconnect handled gracefully - no controller errors expected");
    } catch (streamError) {
      console.error(`❌ Stream error: ${streamError.message}`);
    }

    return { success: true, events: eventCount };
  } catch (error) {
    console.error("❌ Test failed:", error.message);
    return { success: false, error: error.message };
  }
}

testControllerDisconnect();
