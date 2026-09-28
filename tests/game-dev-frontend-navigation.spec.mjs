import {test,expect} from '@playwright/test';
test('general fallback retains its view while operator link carries selected game and exact build',async({page})=>{
 await page.goto('/apps/kanban/?view=game-dev&game=fps-gauntlet&version=fixture-v1&platform=linux-x64');
 await expect(page.locator('#game-selector')).toHaveValue('fps-gauntlet');
 await expect(page.locator('[data-game-dev-launch]')).toHaveAttribute('href','https://gamedev.ninjaprivacy.org/games/dev/?game=fps-gauntlet&version=fixture-v1&platform=linux-x64');
 await page.locator('#game-selector').selectOption({index:1});
 const game=await page.locator('#game-selector').inputValue();
 await expect(page.locator('[data-game-dev-launch]')).toHaveAttribute('href',`https://gamedev.ninjaprivacy.org/games/dev/?game=${game}`);
 await page.getByRole('link',{name:'General',exact:true}).click();
 await expect(page.locator('#game-dev-panel')).toBeHidden();
});
