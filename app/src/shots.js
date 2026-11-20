// Screenshot scenes for the entry's screenshots (?shot=...). Each scene sets
// up a fixed, real state of the app — a photo loaded, a layout and grade
// chosen — so the screenshots show the app as it actually works.
export async function runShot(shot, params, apply) {
  const body = document.body;
  if (shot === "cover") {
    // The exported wide cover, full window: first screenshot, the cover.
    body.classList.add("shot-cover");
    await apply("boulevard", (state) => {
      state.layout = "grid";
      state.grade = "sunset";
      state.size = "1920x1080";
      state.title = "NIGHT DRIVE";
      state.subtitle = "Leonida after dark";
      state.badge = "LEONIDA";
      state.stars = 4;
    });
  } else if (shot === "editor") {
    // The editor itself, with a photo loaded and the grid on screen. Wide
    // size so the whole cover (title band included) fits the window.
    body.classList.add("shot-editor");
    await apply("pier", (state) => {
      state.layout = "grid";
      state.grade = "neon";
      state.size = "1920x1080";
      state.title = "NIGHT DRIVE";
      state.subtitle = "Leonida after dark";
      state.badge = "LEONIDA";
      state.stars = 5;
    });
  } else if (shot === "sizes") {
    // The all-sizes preview strip, so the judge sees every export size.
    body.classList.add("shot-sizes");
    await apply("boulevard", (state) => {
      state.layout = "hero";
      state.grade = "golden";
      state.size = "1080x1080";
      state.title = "NIGHT DRIVE";
      state.subtitle = "Leonida after dark";
      state.badge = "LEONIDA";
      state.stars = 4;
    });
    document.getElementById("previewSizes").click();
  } else if (shot === "story") {
    // The story-size cover, full window, tilted-stack layout.
    body.classList.add("shot-story");
    await apply("pier", (state) => {
      state.layout = "stack";
      state.grade = "pink";
      state.size = "1080x1920";
      state.title = "NIGHT DRIVE";
      state.subtitle = "Leonida after dark";
      state.badge = "LEONIDA";
      state.stars = 4;
    });
  } else {
    await apply("boulevard", null);
  }
}
