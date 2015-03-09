var Cloudant = require('cloudant'),
    Promise = require("bluebird"),
    program = require('commander'),
    fs = Promise.promisifyAll(require("fs")),
    dateFormat = require('dateformat');

program
    .version('0.0.2')
    .option('-u, --username <username>', 'Cloudant username')
    .option('-p, --password <password>', 'Cloudant password')
    .option('-c, --credentials [credentials]', 'Path to .cloudant file containing credentials (defaults to cwd)', '.')
    .option('-d, --db [databases]', 'Optionally filter databases')
    .option('-f, --folder [folder]', 'Folder in which to save backups (defaults to yyyy-mm-dd)', 'yyyy-mm-dd')
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

        fs.readFileAsync(program.credentials + '/.cloudant').then(function(data) {
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
                    cloudant: cloudant,
                    dbList: dbList
                });
            });
        });
    });
};

// Loop through list of databases and get all documents
// save documents as [database].json
var downloadDatabase = function(cloudant, dbName) {
    return new Promise(function(resolve, reject) {
        var db = cloudant.use(dbName);

        db.list({
            include_docs: true
        }, function(err, body) {
            if (err) {
                return reject(Error('Failed to list documents'));
            }

            var folder = dateFormat(program.folder);

            try {
                fs.statSync(folder);
            } catch (e) {
                fs.mkdirSync(folder);
            }

            fs.writeFileAsync(folder + '/' + dbName + '.json', JSON.stringify(body)).then(resolve, reject);
        });
    });
};

var downloadAllDatabases = function(opts) {
    return new Promise(function(resolve, reject) {

        var backups = [];
        opts.dbList.forEach(function(dbName) {
            backups.push(downloadDatabase(opts.cloudant, dbName));
        });

        Promise.all(backups).then(function() {
            resolve(dateFormat('isoDateTime') + ': Successfully backed up databases: ' + opts.dbList.join(','));
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
