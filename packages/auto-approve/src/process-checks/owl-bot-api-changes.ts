// Copyright 2021 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import {Process, PullRequest} from '../interfaces';
import {
  checkAuthor,
  checkTitleOrBody,
  reportIndividualChecks,
  getOpenPRsInRepoFromSameAuthor,
} from '../utils-for-pr-checking';
import {getFileContent, listCommitsOnAPR} from '../get-pr-info';
import {Octokit} from '@octokit/rest';

export class OwlBotAPIChanges extends Process {
  classRule: {
    author: string;
    titleRegex?: RegExp;
    bodyRegex?: RegExp;
  };

  constructor(incomingOctokit: Octokit) {
    super(incomingOctokit);
    this.classRule = {
      author: 'gcf-owl-bot[bot]',
      titleRegex: /(breaking|BREAKING|!)/,
      bodyRegex: /PiperOrigin-RevId/,
    };
  }

  public async checkPR(incomingPR: PullRequest): Promise<boolean> {
    const authorshipMatches = checkAuthor(
      this.classRule.author,
      incomingPR.author
    );

    const titleMatches = checkTitleOrBody(
      incomingPR.title,
      this.classRule.titleRegex
    );

    let bodyMatches = true;
    if (incomingPR.body) {
      bodyMatches = checkTitleOrBody(incomingPR.body, this.classRule.bodyRegex);
    }

    const fileContent = await getFileContent(
      incomingPR.repoOwner,
      incomingPR.repoName,
      '.repo-metadata.json',
      this.octokit
    );

    const isGAPIC = JSON.parse(fileContent).library_type === 'GAPIC_AUTO';

    const openOwlBotPRs = await getOpenPRsInRepoFromSameAuthor(
      incomingPR.repoOwner,
      incomingPR.repoName,
      incomingPR.author,
      this.octokit
    );

    let otherOwlBotPRs = false;
    if (openOwlBotPRs > 1) {
      otherOwlBotPRs = true;
    }

    const commitsOnPR = await listCommitsOnAPR(
      incomingPR.repoOwner,
      incomingPR.repoName,
      incomingPR.prNumber,
      this.octokit
    );

    const commitAuthors = commitsOnPR.filter(
      x => x.author?.login !== this.classRule.author
    );
    let otherCommitAuthors = false;
    if (commitAuthors.length > 0) {
      otherCommitAuthors = true;
    }

    reportIndividualChecks(
      [
        'authorshipMatches',
        'titleMatches',
        'bodyMatches',
        'isGAPIC',
        'areThereOtherOwlBotPRs',
        'areThereOtherCommitAuthors',
      ],
      [
        authorshipMatches,
        !titleMatches,
        bodyMatches,
        isGAPIC,
        !otherOwlBotPRs,
        !otherCommitAuthors,
      ],
      incomingPR.repoOwner,
      incomingPR.repoName,
      incomingPR.prNumber
    );

    // We are looking for an antipattern, i.e., if title does not include BREAKING, and if there are no other owlbot PRs and no other authors made commits on the PR
    return (
      authorshipMatches &&
      !titleMatches &&
      bodyMatches &&
      isGAPIC &&
      !otherOwlBotPRs &&
      !otherCommitAuthors
    );
  }
}
