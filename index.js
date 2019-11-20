const axios = require('axios');
const { stripIndents } = require('common-tags');
const { Toolkit } = require('actions-toolkit');

const actionConfig = {
  zeitToken: process.env.ZEIT_TOKEN,
  teamId: process.env.ZEIT_TEAMID,
  deployedCommit: process.env.GITHUB_SHA,
  deployedBranch: process.env.GITHUB_REF,
};

if (!actionConfig.zeitToken) {
  throw new Error(`ZEIT_TOKEN environment variable is not set`);
}

const zeitAPIClient = axios.create({
  baseURL: 'https://api.zeit.co',
  headers: { Authorization: `Bearer ${actionConfig.zeitToken}` },
  params: { teamId: actionConfig.teamId },
});

// Run your GitHub Action!
Toolkit.run(async tools => {
  const { data: comments } = await tools.github.issues.listComments({
    ...tools.context.repo,
    issue_number: tools.context.payload.pull_request.number,
  });

  let deploymentUrl;
  let deploymentCommit;
  let deploymentProjectName;

  const {
    data: {
      deployments: [commitDeployment],
    },
  } = await zeitAPIClient.get('/v4/now/deployments', {
    params: {
      'meta-commit': actionConfig.deployedCommit,
    },
  });

  if (commitDeployment) {
    deploymentProjectName = commitDeployment.name;
    deploymentUrl = commitDeployment.url;
    deploymentCommit = commitDeployment.meta.commit;
  } else {
    const {
      data: {
        deployments: [lastBranchDeployment],
      },
    } = await zeitAPIClient.get('/v4/now/deployments', {
      params: {
        'meta-branch': actionConfig.deployedBranch,
      },
    });

    if (lastBranchDeployment) {
      deploymentProjectName = lastBranchDeployment.name;
      deploymentUrl = lastBranchDeployment.url;
      deploymentCommit = lastBranchDeployment.meta.commit;
    } else {
      const {
        data: {
          deployments: [lastDeployment],
        },
      } = await zeitAPIClient.get('/v4/now/deployments', {
        params: {
          limit: 1,
        },
      });

      if (lastDeployment) {
        deploymentProjectName = lastDeployment.name;
        deploymentUrl = lastDeployment.url;
        deploymentCommit = lastDeployment.meta.commit;
      }
    }
  }

  const commentFirstSentence = `Deploy preview for _${deploymentProjectName}_ ready!`;
  const zeitPreviewURLComment = comments.find(comment =>
    comment.body.startsWith(commentFirstSentence)
  );

  const commentBody = stripIndents`
    ${commentFirstSentence}

    Built with commit ${deploymentCommit}

    https://${deploymentUrl}
  `;

  if (zeitPreviewURLComment) {
    await tools.github.issues.updateComment({
      ...tools.context.repo,
      comment_id: zeitPreviewURLComment.id,
      body: commentBody,
    });
  } else {
    await tools.github.issues.createComment({
      ...tools.context.repo,
      issue_number: tools.context.payload.pull_request.number,
      body: commentBody,
    });
  }
});
