var Cloudant = require('cloudant'),
    Promise = require("bluebird"),
    Nano = require('nano'),
    program = require('commander'),
    fs = Promise.promisifyAll(require("fs"));

program
    .version('0.0.1')
    .option('-u, --username <username>', 'Cloudant username')
    .option('-p, --password <password>', 'Cloudant password')
    .option('-d, --db [databases]', 'Optionally filter databases')
    .option('-f, --folder [folder]', 'Folder in which to save backups (defaults to cwd)', '.')
    .parse(process.argv);

// Grab Cloudant username/password from .cloudant file or --username/--password args
var getCloudantCredentials = function() {
    return new Promise(function(resolve, reject) {
        if (program.username && program.password) {
            return resolve({
                username: program.username,
                password: program.password
            });
        }

        fs.readFileAsync('.cloudant').then(function(data) {
            resolve(JSON.parse(data));
        }, function(err) {
            switch (err.code) {
                case 'ENOENT':
                    reject(Error('.cloudant credentials not found'));
                    break;
            }
        });
    });
};

// Obtain a list of databases, filter these by --db [db1,db2...] arg
var listDatabases = function(creds) {
    return new Promise(function(resolve, reject) {
        Cloudant({
            account: creds.username,
            password: creds.password
        }, function(err, cloudant) {
            if (err) {
                return reject(Error('Failed to connect to Cloudant using credentials ' + JSON.stringify(creds)));
            }

            cloudant.db.list(function(err, dbList) {
                if (err) {
                    return reject(Error('Failed to list databases'));
                }

                if (program.db) {
                    var _dbList = program.db.split(',');
                    dbList = dbList.filter(function(db) {
                        return _dbList.indexOf(db) !== -1;
                    });
                }

                if (dbList.length === 0) {
                    return reject(Error('Database(s) not found'));
                }

                resolve({
                    creds: creds,
                    dbList: dbList
                });
            });
        });
    });
};

// Loop through list of databases and get all documents
// save documents as [database].json
var downloadDatabase = function(creds, dbName) {
    return new Promise(function(resolve, reject) {
        var db = Nano('https://' + creds.username + ':' + creds.password + '@' + creds.username + '.cloudant.com/' + dbName);

        db.list({
            include_docs: true
        }, function(err, body) {
            if (err) {
                return reject(Error('Failed to list documents'));
            }

            try {
                fs.statSync(program.folder);
            } catch (e) {
                fs.mkdirSync(program.folder);
            }

            fs.writeFileAsync(program.folder + '/' + dbName + '.json', JSON.stringify(body)).then(resolve, reject);

        });
    });
};

var downloadAllDatabases = function(opts) {
    return new Promise(function(resolve, reject) {

        var backups = [];
        opts.dbList.forEach(function(dbName) {
            backups.push(downloadDatabase(opts.creds, dbName));
        });

        Promise.all(backups).then(function() {
            resolve('Successfully backed up all databases (' + opts.dbList.join(',') + ')');
        }, function(err) {
            reject(err);
        });

    });
};

// Perform task
getCloudantCredentials()
    .then(listDatabases)
    .then(downloadAllDatabases)
    .then(function(result) {
        console.log(result);
    }, console.error);
