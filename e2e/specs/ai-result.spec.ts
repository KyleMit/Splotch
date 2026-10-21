import sharp from 'sharp';
import { expect } from '../fixtures.ts';
import { MANAGED_ACCESS_CODE } from '../server/serverEnv.ts';
import { aiImageButton, openAiResult, openDrawer, test } from '../support/group-a.ts';

const RGBA_CHANNELS = 4;
// A pixel this dark is the black stroke the spec drew, never the paper's grain.
const INK_MAX_CHANNEL = 40;
const SAFETY_REFUSAL_STATUS = 422;

// The AI result dialog, driven through the real chrome with the generation endpoint stood in for
// below the client pipeline, so canvas export, upload encoding, response parsing and the result's
// presentation all run. `openAiResult` leaves a generation under way, waiting on its endpoint.
test.describe('the AI result', () => {
  test('uploads the live drawing as an image, with the access code and the chosen style', async ({
    drawingScreen,
  }) => {
    const { endpoint } = await openAiResult(drawingScreen);
    await endpoint.requestSeen();

    const [upload] = endpoint.requests;
    expect(upload.method).toBe('POST');
    expect(upload.path).toBe('/api/generate-image?style=Magical');
    expect(upload.contentType).toMatch(/^image\//);
    expect(upload.accessToken).toBe(MANAGED_ACCESS_CODE);
    const { data } = await sharp(upload.body)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let inked = 0;
    for (let offset = 0; offset < data.length; offset += RGBA_CHANNELS)
      if (Math.max(data[offset], data[offset + 1], data[offset + 2]) < INK_MAX_CHANNEL) inked++;
    expect(inked, 'dark pixels in the uploaded drawing').toBeGreaterThan(0);
  });

  test('announces the picture being made, then that it is ready, and shows it', async ({
    drawingScreen,
  }) => {
    const { result, endpoint } = await openAiResult(drawingScreen);
    const status = result.getByRole('status');
    await expect(status).toHaveText('Making your picture…');
    await expect(result.getByRole('img', { name: 'Your AI picture' })).toBeHidden();

    await endpoint.succeed();

    await expect(status).toHaveText('Your picture is ready');
    await expect(result.getByRole('img', { name: 'Your AI picture' })).toBeVisible();
    await expect(result.getByRole('button', { name: 'Download' })).toBeVisible();
    await expect(result.getByText('AI-generated picture')).toBeVisible();
  });

  test('says a picture failed, then offers another try that can succeed', async ({
    drawingScreen,
  }) => {
    const { result, endpoint } = await openAiResult(drawingScreen);
    await expect(result.getByRole('status')).toHaveText('Making your picture…');

    await endpoint.fail();

    await expect(result.getByRole('status')).toHaveText("That didn't work");
    await expect(result.getByRole('heading', { name: "Hmm, that didn't work" })).toBeVisible();
    await result.getByRole('button', { name: 'Try again' }).click();
    await endpoint.requestSeen(2);
    await endpoint.succeed();
    await expect(result.getByRole('status')).toHaveText('Your picture is ready');
  });

  test('keeps the drawing on the paper when its picture fails and the result is closed', async ({
    drawingScreen,
  }) => {
    const { result, endpoint, stroke } = await openAiResult(drawingScreen);
    await endpoint.fail();
    await expect(result.getByRole('status')).toHaveText("That didn't work");
    await result.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(result).toBeHidden();

    await expect.poll(() => drawingScreen.inkedPixels(stroke)).toBeGreaterThan(stroke.lengthPx);
  });

  test('turns a safety refusal into a kind message with no retry', async ({ drawingScreen }) => {
    const { result, endpoint } = await openAiResult(drawingScreen);

    await endpoint.fail(SAFETY_REFUSAL_STATUS);

    await expect(result.getByText("Let's try drawing something else!")).toBeVisible();
    await expect(result.getByRole('button', { name: 'Try again' })).toBeHidden();
    await expect(result.getByRole('button', { name: 'Report this refusal' })).toBeVisible();
  });

  test('hands focus back to the picture button when the result closes', async ({
    drawingScreen,
  }) => {
    const { result, endpoint } = await openAiResult(drawingScreen);
    await endpoint.succeed();
    await expect(result.getByRole('status')).toHaveText('Your picture is ready');

    await result.getByRole('button', { name: 'Close', exact: true }).click();

    await expect(result).toBeHidden();
    await expect(aiImageButton(drawingScreen.page)).toBeFocused();
  });

  test('hands focus to the drawer toggle when the drawer was folded away meanwhile', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    const { result, endpoint } = await openAiResult(drawingScreen);
    await result.getByRole('button', { name: 'Keep drawing while you wait' }).click();
    await expect(result).toBeHidden();
    await page.getByRole('button', { name: 'Collapse controls' }).click();
    await page.getByRole('button', { name: 'Your picture is being made — tap to watch' }).click();
    await endpoint.succeed();
    await expect(result.getByRole('status')).toHaveText('Your picture is ready');

    await result.getByRole('button', { name: 'Close', exact: true }).click();

    await expect(result).toBeHidden();
    await expect(page.getByRole('button', { name: 'Expand controls' })).toBeFocused();
  });
});

test.describe('a generation sent to the corner', () => {
  test('goes to the polaroid, and the polaroid brings it back', async ({ drawingScreen }) => {
    const { page } = drawingScreen;
    const { result } = await openAiResult(drawingScreen);

    await result.getByRole('button', { name: 'Keep drawing while you wait' }).click();
    await expect(result).toBeHidden();
    const polaroid = page.getByRole('button', {
      name: 'Your picture is being made — tap to watch',
    });
    await expect(polaroid).toBeVisible();

    await polaroid.click();
    await expect(result).toBeVisible();
    await expect(polaroid).toBeHidden();
  });

  test('is what the picture button reopens while it is still running', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    const { result } = await openAiResult(drawingScreen);
    await result.getByRole('button', { name: 'Keep drawing while you wait' }).click();
    await expect(result).toBeHidden();

    await openDrawer(page);
    const reopen = page.getByRole('button', { name: 'Show the picture being made' });
    await expect(reopen).toBeEnabled();
    await reopen.click();

    await expect(result).toBeVisible();
  });

  test('says it is ready once finished, and comes back to the revealed picture', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    const { result, endpoint } = await openAiResult(drawingScreen);
    await result.getByRole('button', { name: 'Keep drawing while you wait' }).click();
    await expect(result).toBeHidden();

    await endpoint.succeed();
    const polaroid = page.getByRole('button', { name: 'Your picture is ready — tap to see it' });
    await expect(polaroid).toContainText('Ready!');
    await openDrawer(page);
    await expect(page.getByRole('button', { name: 'Show your finished picture' })).toBeVisible();

    await polaroid.click();

    await expect(result.getByRole('img', { name: 'Your AI picture' })).toBeVisible();
    await expect(result.getByRole('progressbar')).toBeHidden();
  });

  test('says the run failed rather than promising a picture that is not coming', async ({
    drawingScreen,
  }) => {
    const { page } = drawingScreen;
    const { result, endpoint } = await openAiResult(drawingScreen);
    await result.getByRole('button', { name: 'Keep drawing while you wait' }).click();
    await expect(result).toBeHidden();

    await endpoint.fail();

    await expect(page.getByRole('button', { name: "That didn't work — tap to see" })).toContainText(
      'Oh no'
    );
    await openDrawer(page);
    await expect(page.getByRole('button', { name: "Show what didn't work" })).toBeVisible();
  });
});
