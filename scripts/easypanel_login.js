const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ headless: true });
  const p = await b.newPage();
  
  await p.goto('http://35.254.218.190:3000/', { timeout: 30000 });
  console.log('Title:', await p.title());
  
  await p.fill('input[name="email"]', 'daveymena16@gmail.com');
  await p.fill('input[name="password"]', '6715320Dvd.');
  await p.click('button[type="submit"]');
  await p.waitForTimeout(3000);
  
  console.log('URL after login:', p.url());
  
  await p.goto('http://35.254.218.190:3000/projects/tecnology', { timeout: 30000 });
  await p.waitForTimeout(2000);
  console.log('Project page:', p.url());
  
  await p.screenshot({ path: 'data/easypanel_project.png', fullPage: true });
  
  const body = await p.textContent('body');
  console.log('Body:', body.substring(0, 3000));
  
  await b.close();
})();
