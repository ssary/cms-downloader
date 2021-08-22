'use strict';
const puppeteer = require('puppeteer');
const inquirer = require('inquirer');
const fs = require('fs');
const httpntlm = require('httpntlm');
require('dotenv').config();

const machine_type = process.platform;
const fileSeparator = () => {
  return machine_type === 'win32' ? '\\' : '/';
};

const pupp_options = {
  headless: true,
};

const userAuthData = {
  username: process.env.GUC_SK_USERNAME,
  password: process.env.GUC_SK_PASSWORD,
};

const authenticateUser = () => {
  return new Promise((resolve, reject) => {
    httpntlm.get(
      {
        ...userAuthData,
        url: 'https://cms.guc.edu.eg/apps/student/HomePageStn.aspx',
        rejectUnauthorized: false,
      },
      (err, res) => {
        console.log(res.statusCode === 200 ? '[+] You are authorized\n============' : '[!] You are not authorized. Please review your login credentials.');
        resolve(res.statusCode === 200);
      }
    );
  });
};

const navigateTo = async (page, target_link) => {
  await page.goto(target_link, {
    waitUntil: 'networkidle2',
    timeout: 500000,
  });
};

const getSeasons = async (page) => {
  return await page.evaluate(function () {
    const seasons = [];
    document.querySelectorAll('div[class="menu-header-title"]').forEach((el) => {
      const title = el.innerHTML.trim();
      seasons.push({
        name: title.substring(title.indexOf('Title') + 6).trim(),
        sid: parseInt(title.substring(title.indexOf(':') + 1, title.indexOf(',')).trim()),
        courses: [],
      });
    });
    seasons.forEach((_, index) => {
      const seasonCourses = document.querySelectorAll(`table[id="ContentPlaceHolderright_ContentPlaceHoldercontent_r1_GridView1_${index}"]`)[0].children[0].children;
      for (let i = 1; i < seasonCourses.length; i++) {
        const courseName = seasonCourses[i].children[1].innerText.trim().replaceAll('|', '');
        seasons[index].courses.push({
          name: courseName.substring(0, courseName.lastIndexOf('(')).trim().replace('(', '[').replace(')', ']'),
          id: parseInt(courseName.substring(courseName.lastIndexOf('(') + 1, courseName.lastIndexOf(')')).trim()),
        });
      }
    });
    return seasons;
  });
};

const getAnswers = async (questions, checkbox, message, params) => {
  const answers = await inquirer.prompt([
    {
      type: checkbox ? 'checkbox' : 'list',
      message: message,
      name: 'userAnswers',
      choices: questions,
      validate(answer) {
        if (answer.length < 1) {
          return 'You must choose at least one course.';
        }
        return true;
      },
      loop: false,
    },
  ]);
  return checkbox ? answers.userAnswers.map((a) => questions.findIndex((q) => q.name === a)) : questions.findIndex((q) => q.name === answers.userAnswers);
};

(async () => {
  const browser = await puppeteer.launch(pupp_options);
  const page = await browser.newPage();

  // 00- Authenticate User
  console.log('[-] Authenticating...');
  let user_auth = await authenticateUser();
  if (!user_auth) {
    await browser.close();
    return;
  }

  await page.authenticate(userAuthData);
  await navigateTo(page, 'https://cms.guc.edu.eg/apps/student/ViewAllCourseStn');

  const seasons = await getSeasons(page);
  const selectedSeasons = seasons[await getAnswers(seasons, false, 'Please select a season', ['sid'])];
  const selectedCourses = (await getAnswers(selectedSeasons.courses, true, 'Please select the courses you want', ['id'])).map((c) => selectedSeasons.courses[c]);
  console.log(selectedCourses);

  // 6- End the session
  await browser.close();
})();
