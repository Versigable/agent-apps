import { test, expect } from '@playwright/test';

test('RIFT//RUNNER is discoverable in the arcade with playable and artifact links', async ({ page, request }) => {
  const manifest = await (await request.get('/games/manifest.json')).json();
  const game = manifest.games.find(g => g.id === 'rift-runner');
  expect(game).toMatchObject({ title: 'RIFT//RUNNER', model: 'gpt-6 Astra', playUrl: './rift-runner/' });
  expect(game.artifacts.latestVideo).toContain('rift-runner-latest.webm');
  await page.goto('/games/arcade/');
  const card = page.getByTestId('game-card-rift-runner');
  await expect(card.getByRole('link', {name: 'Play RIFT//RUNNER', exact: true})).toHaveAttribute('href', '../rift-runner/');
});
