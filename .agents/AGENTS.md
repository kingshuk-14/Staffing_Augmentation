# Workspace Customizations

## Database Schema Rule
ALWAYS update `database/schema.sql` immediately whenever you execute any `ALTER TABLE`, `CREATE TABLE`, `DROP TABLE`, or any other schema mutation commands on the live MySQL database. 

The `schema.sql` file must remain perfectly in sync with the live `staffing_db` local schema at all times so that new developers can initialize the exact same database structure locally.
