'use strict';

const yargs = require('yargs');
const sinon = require('sinon');
const test = require('ava');
const proxyquire = require('proxyquire');
const fs = require('fs');
const querystring = require('querystring');

const getStub = sinon.stub();
const postStub = sinon.stub();
const delStub = sinon.stub();
const printSpy = sinon.spy();
const downloadSpy = sinon.spy();
const uploadSpy = sinon.spy();
const deleteFileStub = sinon.stub();
let callback;

const fsStub = Object.assign({}, fs, {
  unlinkSync: (filePath) => {
    deleteFileStub(filePath);
    callback();
  }
});

const sleepStub = sinon.stub().resolves();
let getShouldCallCallback = false;

const mocks = {
  '../../api': {
    get: function (options, url) {
      const res = getStub(options, url);
      if (getShouldCallCallback) {
        callback();
      }
      return res;
    },
    post: postStub,
    del: delStub,
    download: function (options, url, file, name) {
      downloadSpy(options, url, file, name);
      callback();
    },
    upload: function (url, file, size) {
      uploadSpy(url, file, size);
      callback();
    }
  },
  '../../print': (data, opts) => {
    printSpy(data, opts);
    callback();
  },
  '../../sleep': sleepStub,
  'fs': fsStub
};

const get = proxyquire('../../../lib/cmds/files_cmds/get', mocks);
const del = proxyquire('../../../lib/cmds/files_cmds/del', mocks);
const list = proxyquire('../../../lib/cmds/files_cmds/list', mocks);
const download = proxyquire('../../../lib/cmds/files_cmds/download', mocks);
const upload = proxyquire('../../../lib/cmds/files_cmds/upload', mocks);

test.afterEach.always(t => {
  getStub.reset();
  postStub.reset();
  delStub.reset();
  printSpy.resetHistory();
  uploadSpy.resetHistory();
  downloadSpy.resetHistory();
  deleteFileStub.reset();
  sleepStub.reset();
  callback = null;
  getShouldCallCallback = false;
});

test.serial.cb('The "files" command should list files for an account or dataset ID', t => {
  const res = { data: { items: [] } };
  getStub.onFirstCall().returns(res);
  callback = () => {
    t.is(getStub.callCount, 1);
    t.is(getStub.getCall(0).args[1], '/v1/files?datasetId=dataset&pageSize=25&nextPageToken=&orderBy=name');
    t.is(printSpy.callCount, 1);
    t.deepEqual(printSpy.getCall(0).args[0], { items: [] });
    t.end();
  };

  yargs.command(list)
    .parse('list dataset');
});

test.serial.cb('The "files" command should list files for an account with optional args', t => {
  const res = { data: { items: [] } };
  getStub.onFirstCall().returns(res);
  callback = () => {
    t.is(getStub.callCount, 1);
    t.is(getStub.getCall(0).args[1], '/v1/files?datasetId=dataset&pageSize=30&nextPageToken=token&orderBy=name&name=name');
    t.is(printSpy.callCount, 1);
    t.deepEqual(printSpy.getCall(0).args[0], { items: [] });
    t.end();
  };

  yargs.command(list)
    .parse('list dataset --page-size 30 --prefix name --next-page-token token');
});

test.serial.cb('The "files-get" command should get a file', t => {
  const res = { data: {} };
  getStub.onFirstCall().returns(res);
  callback = () => {
    t.is(getStub.callCount, 1);
    t.is(getStub.getCall(0).args[1], '/v1/files/fileid');
    t.is(printSpy.callCount, 1);
    t.is(printSpy.getCall(0).args[0], res.data);
    t.end();
  };

  yargs.command(get)
    .parse('get fileid');
});

test.serial.cb('The "files-delete" command should delete a file', t => {
  const res = { data: {} };
  delStub.onFirstCall().returns(res);

  yargs.command(del)
    .parse('delete fileid');

  t.is(delStub.callCount, 1);
  t.is(delStub.getCall(0).args[1], '/v1/files/fileid');
  t.end();
});

test.serial.cb('The "files-download" command should download a file', t => {
  const res = { data: { name: 'filename' } };
  getStub.onFirstCall().returns(res);
  callback = () => {
    t.is(getStub.callCount, 1);
    t.is(getStub.getCall(0).args[1], '/v1/files/fileid');
    t.is(downloadSpy.callCount, 1);
    t.is(downloadSpy.getCall(0).args[1], '/v1/files/fileid?include=downloadUrl');
    t.is(downloadSpy.getCall(0).args[2], '/dir/filename');
    t.end();
  };

  yargs.command(download)
    .parse('download fileid /dir');
});

test.serial.cb('The "files-upload" command should upload a file', t => {
  const res = { data: { uploadUrl: 'https://host/upload' } };
  postStub.onFirstCall().returns(res);
  callback = () => {
    t.is(postStub.callCount, 1);
    t.is(postStub.getCall(0).args[1], '/v1/files');
    t.deepEqual(postStub.getCall(0).args[2], {
      id: undefined,
      name: `${__dirname}/data/file1.txt`,
      datasetId: 'dataset',
      overwrite: undefined
    });
    t.is(uploadSpy.getCall(0).args[0], 'https://host/upload');
    t.is(uploadSpy.getCall(0).args[1], `${__dirname}/data/file1.txt`);
    t.is(uploadSpy.getCall(0).args[2], 7);
    t.end();
  };

  yargs.command(upload)
    .parse(`upload ${__dirname}/data/file1.txt dataset`);
});

test.serial('The "files-upload" command should ignore already uploaded file error', t => {
  const error = {
    response: {
      data: {
        error: 'File with name foo already exists in dataset'
      }
    }
  };
  postStub.onFirstCall().throws(error);

  yargs.command(upload)
    .parse(`upload ${__dirname}/data/file1.txt dataset`);

  t.is(postStub.callCount, 1);
  t.is(postStub.getCall(0).args[1], '/v1/files');
  t.deepEqual(postStub.getCall(0).args[2], {
    id: undefined,
    name: `${__dirname}/data/file1.txt`,
    datasetId: 'dataset',
    overwrite: undefined
  });
  t.is(uploadSpy.callCount, 0);
});

test.serial.cb('The "files-upload" command should upload a directory of files', t => {
  const res = { data: { uploadUrl: 'https://host/upload' } };
  postStub.onFirstCall().returns(res);
  postStub.onSecondCall().returns(res);

  callback = () => {
    if (postStub.callCount !== 2) {
      return;
    }
    t.is(postStub.callCount, 2);
    t.deepEqual(postStub.getCall(0).args[2], {
      id: undefined,
      name: `${__dirname}/data/file1.txt`,
      datasetId: 'dataset',
      overwrite: undefined
    });
    t.deepEqual(postStub.getCall(1).args[2], {
      id: undefined,
      name: `${__dirname}/data/file2.txt`,
      datasetId: 'dataset',
      overwrite: undefined
    });

    t.true(uploadSpy.calledWith('https://host/upload', `${__dirname}/data/file1.txt`, 7));
    t.true(uploadSpy.calledWith('https://host/upload', `${__dirname}/data/file2.txt`, 7));
    t.end();
  };

  yargs.command(upload)
    .parse(`upload ${__dirname}/data dataset`);
});

test.serial.cb('The "files-upload" command should recursively upload a directory of files', t => {
  const res = { data: { uploadUrl: 'https://host/upload' } };
  postStub.onFirstCall().returns(res);
  postStub.onSecondCall().returns(res);
  postStub.onThirdCall().returns(res);

  callback = () => {
    if (postStub.callCount !== 3) {
      return;
    }
    t.is(postStub.callCount, 3);
    postStub.calledWith(sinon.match.any, sinon.match.any, sinon.match({
      name: `${__dirname}/data/file1.txt`,
      datasetId: 'dataset',
      overwrite: undefined
    }));
    postStub.calledWith(sinon.match.any, sinon.match.any, sinon.match({
      name: `${__dirname}/data/file2.txt`,
      datasetId: 'dataset',
      overwrite: undefined
    }));
    postStub.calledWith(sinon.match.any, sinon.match.any, sinon.match({
      name: `${__dirname}/data/dir/file3.txt`,
      datasetId: 'dataset',
      overwrite: undefined
    }));

    t.true(uploadSpy.calledWith('https://host/upload', `${__dirname}/data/file1.txt`, 7));
    t.true(uploadSpy.calledWith('https://host/upload', `${__dirname}/data/file2.txt`, 7));
    t.true(uploadSpy.calledWith('https://host/upload', `${__dirname}/data/dir/file3.txt`, 7));

    t.end();
  };

  yargs.command(upload)
    .parse(`upload ${__dirname}/data dataset --recursive`);
});

test.serial.cb('The "files-upload" command should upload a file with client supplied id', t => {
  const res = { data: { uploadUrl: 'https://host/upload' } };
  postStub.onFirstCall().returns(res);
  callback = () => {
    t.is(postStub.callCount, 1);
    t.is(postStub.getCall(0).args[1], '/v1/files');
    t.deepEqual(postStub.getCall(0).args[2], {
      id: '1234',
      name: `${__dirname}/data/file1.txt`,
      datasetId: 'dataset',
      overwrite: undefined
    });
    t.is(uploadSpy.getCall(0).args[0], 'https://host/upload');
    t.is(uploadSpy.getCall(0).args[1], `${__dirname}/data/file1.txt`);
    t.is(uploadSpy.getCall(0).args[2], 7);
    t.end();
  };

  yargs.command(upload)
    .parse(`upload ${__dirname}/data/file1.txt dataset --id 1234`);
});

test.serial.cb('The "files-upload" command should delete files after (verified) upload', t => {
  const res = { data: { uploadUrl: 'https://host/upload' } };
  postStub.onFirstCall().returns(res);
  postStub.onSecondCall().returns(res);
  postStub.onThirdCall().returns(res);

  const getRes = {
    data: {
      items: [{
        size: 7
      }]
    }
  };
  getStub.onFirstCall().resolves(getRes);
  getStub.onSecondCall().resolves(getRes);
  getStub.onThirdCall().resolves(getRes);

  getShouldCallCallback = true;

  callback = () => {
    if (getStub.callCount !== 3 || postStub.callCount !== 3 || deleteFileStub.callCount !== 3) {
      return;
    }
    t.is(postStub.callCount, 3);
    postStub.calledWith(sinon.match.any, sinon.match.any, sinon.match({
      name: `${__dirname}/data/file1.txt`,
      datasetId: 'dataset',
      overwrite: undefined
    }));
    postStub.calledWith(sinon.match.any, sinon.match.any, sinon.match({
      name: `${__dirname}/data/file2.txt`,
      datasetId: 'dataset',
      overwrite: undefined
    }));
    postStub.calledWith(sinon.match.any, sinon.match.any, sinon.match({
      name: `${__dirname}/data/dir/file3.txt`,
      datasetId: 'dataset',
      overwrite: undefined
    }));

    t.true(uploadSpy.calledWith('https://host/upload', `${__dirname}/data/file1.txt`, 7));
    t.true(uploadSpy.calledWith('https://host/upload', `${__dirname}/data/file2.txt`, 7));
    t.true(uploadSpy.calledWith('https://host/upload', `${__dirname}/data/dir/file3.txt`, 7));

    t.is(deleteFileStub.callCount, 3);
    t.true(deleteFileStub.calledWith(`${__dirname}/data/file1.txt`));
    t.true(deleteFileStub.calledWith(`${__dirname}/data/file2.txt`));
    t.true(deleteFileStub.calledWith(`${__dirname}/data/dir/file3.txt`));

    t.true(getStub.calledWith(sinon.match.any, `/v1/files?${querystring.stringify({
      datasetId: 'dataset',
      name: `${__dirname}/data/file1.txt`,
      pageSize: 1
    })}`));
    t.true(getStub.calledWith(sinon.match.any, `/v1/files?${querystring.stringify({
      datasetId: 'dataset',
      name: `${__dirname}/data/file2.txt`,
      pageSize: 1
    })}`));
    t.true(getStub.calledWith(sinon.match.any, `/v1/files?${querystring.stringify({
      datasetId: 'dataset',
      name: `${__dirname}/data/dir/file3.txt`,
      pageSize: 1
    })}`));

    t.end();
  };

  yargs.command(upload)
    .parse(`upload ${__dirname}/data dataset --recursive --delete-after-upload`);
});

test.serial.cb('The "files-upload" command backoff verification retries', t => {
  postStub.onFirstCall().returns({ data: { uploadUrl: 'https://host/upload' } });

  const noItems = { data: { items: [] } };
  getStub.onFirstCall().resolves(noItems);
  getStub.onSecondCall().resolves(noItems);
  getStub.onThirdCall().resolves({
    data: {
      items: [{
        size: 7
      }]
    }
  });

  getShouldCallCallback = true;

  callback = () => {
    if (deleteFileStub.callCount !== 1) {
      return;
    }
    t.is(postStub.callCount, 1);
    postStub.calledWith(sinon.match.any, sinon.match.any, sinon.match({
      name: `${__dirname}/data/file1.txt`,
      datasetId: 'dataset',
      overwrite: undefined
    }));

    t.true(uploadSpy.calledWith('https://host/upload', `${__dirname}/data/file1.txt`, 7));

    t.is(deleteFileStub.callCount, 1);
    t.true(deleteFileStub.calledWith(`${__dirname}/data/file1.txt`));

    t.true(getStub.calledWith(sinon.match.any, `/v1/files?${querystring.stringify({
      datasetId: 'dataset',
      name: `${__dirname}/data/file1.txt`,
      pageSize: 1
    })}`));

    t.is(sleepStub.callCount, 3);
    t.is(sleepStub.firstCall.args[0], 500);
    t.is(sleepStub.secondCall.args[0], 1000);
    t.is(sleepStub.thirdCall.args[0], 1500);

    t.end();
  };

  yargs.command(upload)
    .parse(`upload ${__dirname}/data/file1.txt dataset --delete-after-upload`);
});

test.serial('The "files-upload" command will give up after so many verification retries', async t => {
  postStub.onFirstCall().returns({ data: { uploadUrl: 'https://host/upload' } });

  const noItems = { data: { items: [] } };
  getStub.onFirstCall().resolves(noItems);
  getStub.onSecondCall().resolves(noItems);
  getStub.onThirdCall().resolves(noItems);
  getStub.resolves(noItems);

  callback = () => {};

  const error = await t.throws(upload.handler({
    file: `${__dirname}/data/file1.txt`,
    datasetId: 'dataset',
    deleteAfterUpload: true
  }));

  t.is(sleepStub.callCount, 5);
  t.is(deleteFileStub.callCount, 0);
  t.is(error.message, `Could not verify uploaded file: ${`${__dirname}/data/file1.txt`}`);
});

test.serial('The "files-upload" command will fail if verification fails', async t => {
  postStub.onFirstCall().returns({ data: { uploadUrl: 'https://host/upload' } });

  getStub.onFirstCall().resolves({
    data: {
      items: [{
        size: 8
      }]
    }
  });

  callback = () => {};

  const error = await t.throws(upload.handler({
    file: `${__dirname}/data/file1.txt`,
    datasetId: 'dataset',
    deleteAfterUpload: true
  }));

  t.is(deleteFileStub.callCount, 0);
  t.true(error.message.indexOf('Detected file size mismatch') > -1);
});
