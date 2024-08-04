const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const app = express();
const port = 3000;

app.use(bodyParser.json());
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const SECRET_KEY = 'your-secret-key';

const ensureFileExists = (filePath, defaultContent) => {
    if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, JSON.stringify(defaultContent, null, 2));
    }
};

ensureFileExists(path.join(__dirname, 'data', 'projects.json'), []);
ensureFileExists(path.join(__dirname, 'data', 'generationProjects.json'), []);
ensureFileExists(path.join(__dirname, 'data', 'realizationProjects.json'), []);
ensureFileExists('./users.json', []);
ensureFileExists('./statuses.json', [
    { "name": "Запрос", "color": "#007bff" },
    { "name": "Ожидание согласования договора", "color": "#ffc107" },
    { "name": "Ожидание Оплаты", "color": "#17a2b8" },
    { "name": "В пути", "color": "#28a745" },
    { "name": "Выполнено", "color": "#6c757d" },
    { "name": "Отклонено", "color": "#dc3545" }
]);

let users = require('./users.json');
let statuses = require('./statuses.json');

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.sendStatus(401);

    jwt.verify(token, SECRET_KEY, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

const authorizeRole = (role) => {
    return (req, res, next) => {
        if (req.user.role !== role) {
            return res.sendStatus(403);
        }
        next();
    };
};

app.post('/auth/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username);
    if (user == null) {
        return res.status(400).send('Cannot find user');
    }
    if (!bcrypt.compareSync(password, user.password)) {
        return res.status(403).send('Invalid credentials');
    }
    const accessToken = jwt.sign({ username: user.username, role: user.role, firstName: user.firstName, lastName: user.lastName }, SECRET_KEY);
    res.json({ accessToken, role: user.role, firstName: user.firstName, lastName: user.lastName });
});

app.post('/auth/register', (req, res) => {
    const { firstName, lastName, username, password, role } = req.body;
    const user = {
        id: users.length + 1,
        firstName,
        lastName,
        username,
        password: bcrypt.hashSync(password, 10),
        role: role || 'user'
    };
    users.push(user);
    fs.writeFileSync('./users.json', JSON.stringify(users, null, 2));
    const accessToken = jwt.sign({ username: user.username, role: user.role, firstName: user.firstName, lastName: user.lastName }, SECRET_KEY);
    res.json({ accessToken, role: user.role, firstName: user.firstName, lastName: user.lastName });
});

app.delete('/auth/delete', authenticateToken, authorizeRole('admin'), (req, res) => {
    const { username } = req.body;
    const userIndex = users.findIndex(user => user.username === username);
    if (userIndex === -1) {
        return res.status(404).send('User not found');
    }
    users.splice(userIndex, 1);
    fs.writeFileSync('./users.json', JSON.stringify(users, null, 2));
    res.status(200).send('User deleted successfully');
});

app.get('/auth/users', authenticateToken, (req, res) => {
    res.json(users);
});

function readProjects(type) {
    let filePath = path.join(__dirname, 'data', 'projects.json');
    if (type === 'generation') {
        filePath = path.join(__dirname, 'data', 'generationProjects.json');
    } else if (type === 'realization') {
        filePath = path.join(__dirname, 'data', 'realizationProjects.json');
    }
    if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath);
        console.log(`Reading projects from ${filePath}`);
        return JSON.parse(data);
    }
    console.log(`File not found: ${filePath}`);
    return [];
}

function writeProjects(type, projects) {
    let filePath = path.join(__dirname, 'data', 'projects.json');
    if (type === 'generation') {
        filePath = path.join(__dirname, 'data', 'generationProjects.json');
    } else if (type === 'realization') {
        filePath = path.join(__dirname, 'data', 'realizationProjects.json');
    }
    console.log(`Writing projects to ${filePath}`);
    fs.writeFileSync(filePath, JSON.stringify(projects, null, 2));
}

function createNewProjectTemplate(projectData, type) {
    console.log('Creating project template with data:', projectData);
    const { name, id, employees, goals, dependencies, startDate, endDate, phase, comments, weight, status, products, budget, deadline } = projectData;

    const baseProject = {
        name,
        id,
        employees,
        goals: goals.map(goal => ({
            name: goal.name,
            deadline: goal.deadline,
            status: goal.status || "",
            rating: goal.rating || 0,
            customerRating: goal.customerRating || "Нет"
        })),
        dependencies,
        startDate: type === 'projects' ? "0000-00-00" : startDate,
        endDate: type === 'projects' ? "0000-00-00" : endDate,
        phase,
        comments,
        weight,
        status,
        products,
        budget,
        deadline,
        finalCompletionDate: deadline
    };

    if (type === 'generation') {
        return {
            ...baseProject,
            budget
        };
    } else if (type === 'realization') {
        return baseProject;
    }

    return baseProject;
}

function updateDependenciesForProject(newProjectId, dependencies) {
    console.log('Updating dependencies for project:', newProjectId, dependencies);
    dependencies.forEach(depId => {
        let dependencyType;
        if (depId.startsWith('gen')) {
            dependencyType = 'generation';
        } else if (depId.startsWith('real')) {
            dependencyType = 'realization';
        } else {
            dependencyType = 'projects';
        }

        const depProjects = readProjects(dependencyType);
        const dependentProject = depProjects.find(project => project.id === depId);
        if (dependentProject) {
            if (!dependentProject.dependencies.includes(newProjectId)) {
                dependentProject.dependencies.push(newProjectId);
            }
            writeProjects(dependencyType, depProjects);
            console.log(`Updated dependencies for project ${depId}:`, dependentProject.dependencies);
        } else {
            console.error(`Dependent project not found: ${depId}`);
        }
    });
}

app.post('/projects', authenticateToken, (req, res, next) => {
    const { name, id, employees, goals, dependencies, startDate, endDate, phase, comments, weight, status, products, budget, deadline, type } = req.body;

    console.log('Received project data:', req.body);

    const missingFields = [];
    if (!name) missingFields.push('name');
    if (!id) missingFields.push('id');
    if (!employees || employees.length === 0) missingFields.push('employees');
    if (!goals || goals.length === 0) missingFields.push('goals');
    if (!type) missingFields.push('type');
    if (type !== 'projects') {
        if (!startDate) missingFields.push('startDate');
        if (!endDate) missingFields.push('endDate');
    } else {
        req.body.startDate = "0000-00-00";
        req.body.endDate = "0000-00-00";
    }
    if (missingFields.length > 0) {
        console.error('Missing required fields:', missingFields);
        return res.status(400).send(`Missing required fields: ${missingFields.join(', ')}`);
    }

    const projectData = {
        name,
        id,
        employees,
        goals,
        dependencies,
        startDate: req.body.startDate,
        endDate: req.body.endDate,
        phase,
        comments,
        weight,
        status,
        type,
        products,
        budget,
        deadline
    };

    console.log('Creating new project with data:', projectData);

    const newProject = createNewProjectTemplate(projectData, type);

    try {
        let projects = readProjects(type);
        console.log('Existing projects:', projects);
        projects.push(newProject);
        writeProjects(type, projects);
        console.log('Project saved successfully:', newProject);

        if (dependencies && dependencies.length > 0) {
            console.log('Updating dependencies for project:', id);
            updateDependenciesForProject(id, dependencies);
        }

        res.status(201).send(newProject);
    } catch (error) {
        console.error('Error saving project:', error);
        next(error);
    }
});

app.get('/projects', authenticateToken, (req, res) => {
    try {
        let projects = readProjects('projects');
        console.log('Returning projects:', projects);
        res.json(projects);
    } catch (error) {
        console.error('Error loading projects:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/projects/generation', authenticateToken, (req, res) => {
    try {
        let generationProjects = readProjects('generation');
        console.log('Returning generation projects:', generationProjects);
        res.json(generationProjects);
    } catch (error) {
        console.error('Error loading generation projects:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/projects/realization', authenticateToken, (req, res) => {
    try {
        let realizationProjects = readProjects('realization');
        console.log('Returning realization projects:', realizationProjects);
        res.json(realizationProjects);
    } catch (error) {
        console.error('Error loading realization projects:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/projects/all', authenticateToken, (req, res) => {
    const generationProjects = readProjects('generation');
    const realizationProjects = readProjects('realization');
    const projects = generationProjects.concat(realizationProjects);
    res.json(projects);
});

app.patch('/projects/update-dependencies', authenticateToken, (req, res) => {
    const { newProjectId, dependencies } = req.body;

    try {
        dependencies.forEach(depId => {
            let dependencyType = 'projects';
            if (depId.startsWith('gen')) {
                dependencyType = 'generation';
            } else if (depId.startsWith('real')) {
                dependencyType = 'realization';
            }

            const projects = readProjects(dependencyType);
            const project = projects.find(p => p.id === depId);
            if (project) {
                if (!project.dependencies.includes(newProjectId)) {
                    project.dependencies.push(newProjectId);
                }
                writeProjects(dependencyType, projects);
                console.log(`Updated dependencies for project ${depId}:`, project.dependencies);
            } else {
                console.error(`Project not found: ${depId}`);
            }
        });

        res.status(200).send('Dependencies updated successfully');
    } catch (error) {
        console.error('Error updating dependencies:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.patch('/projects/:id/status', authenticateToken, (req, res) => {
    const { id } = req.params;
    const { status, type, goalName } = req.body;

    if (!type) {
        console.error('Type is required');
        return res.status(400).send('Type is required');
    }

    if (!status) {
        console.error('Invalid status');
        return res.status(400).send('Invalid status');
    }

    let projects = readProjects(type);
    let project = projects.find(p => p.id === id);

    if (!project) {
        console.error('Project not found');
        return res.status(404).send('Project not found');
    }

    if (project.goals && project.goals.length > 0) {
        const goal = project.goals.find(g => g.name === goalName);
        if (goal) {
            goal.status = status;
        }
    }

    writeProjects(type, projects);
    console.log(`Updated status for goal in project ${id} to ${status}`);
    console.log(`Updated project data:`, project);
    res.status(200).send('Goal status updated successfully');
});

app.get('/statuses', authenticateToken, (req, res) => {
    try {
        const statuses = JSON.parse(fs.readFileSync(path.join(__dirname, 'statuses.json')));
        res.json(statuses);
    } catch (error) {
        console.error('Error loading statuses:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.patch('/projects/:id/rating', authenticateToken, (req, res) => {
    const { id } = req.params;
    const { ratingType, rating, type } = req.body;

    if (!type) {
        return res.status(400).send('Type is required');
    }

    let projects = readProjects(type);
    let project = projects.find(p => p.id === id);

    if (!project) {
        return res.status(404).send('Project not found');
    }

    if (ratingType === 'manager') {
        project.rating = rating;
    } else if (ratingType === 'customer') {
        project.customerRating = rating;
    } else {
        return res.status(400).send('Invalid rating type');
    }

    writeProjects(type, projects);
    res.status(200).send('Project rating updated successfully');
});

app.patch('/projects/:id/completion-date', authenticateToken, (req, res) => {
    const projectId = req.params.id;
    const { date, type } = req.body;

    console.log(`Updating completion date for project ${projectId} of type ${type} to ${date}`);

    let projects = readProjects(type);

    const project = projects.find(p => p.id === projectId);
    if (!project) {
        console.error('Project not found:', projectId);
        return res.status(404).json({ error: 'Project not found' });
    }

    project.deadline = date;

    try {
        writeProjects(type, projects);
        console.log(`Completion date updated successfully for project ${projectId}`);
        res.json({ message: 'Completion date updated successfully' });
    } catch (err) {
        console.error('Error writing to file:', err);
        res.status(500).json({ error: 'Failed to update completion date' });
    }
});

app.patch('/projects/:id/final-completion-date', authenticateToken, (req, res) => {
    const projectId = req.params.id;
    const { date, type } = req.body;

    console.log(`Updating final completion date for project ${projectId} of type ${type} to ${date}`);

    let projects = readProjects(type);

    const project = projects.find(p => p.id === projectId);
    if (!project) {
        console.error('Project not found:', projectId);
        return res.status(404).json({ error: 'Project not found' });
    }

    project.finalCompletionDate = date;

    try {
        writeProjects(type, projects);
        console.log(`Final completion date updated successfully for project ${projectId}`);
        res.json({ message: 'Final completion date updated successfully' });
    } catch (err) {
        console.error('Error writing to file:', err);
        res.status(500).json({ error: 'Failed to update final completion date' });
    }
});

app.patch('/projects/:id/goal', authenticateToken, (req, res) => {
    const { id } = req.params;
    const { goalName, type } = req.body;

    if (!type) {
        return res.status(400).send('Type is required');
    }

    let projects = readProjects(type);
    let project = projects.find(p => p.id === id);

    if (!project) {
        return res.status(404).send('Project not found');
    }

    project.goals.forEach(goal => goal.selected = goal.name === goalName);

    writeProjects(type, projects);
    res.status(200).send('Goal updated successfully');
});

app.patch('/projects/:id/transfer', authenticateToken, (req, res) => {
    const { id } = req.params;
    const { newEmployee } = req.body;

    let projects = readProjects('projects');
    let project = projects.find(p => p.id === id);

    if (!project) {
        return res.status(404).send('Project not found');
    }

    project.employees = [newEmployee];
    writeProjects('projects', projects);

    res.status(200).send('Project transferred successfully');
});

app.patch('/projects/:id/add-employee', authenticateToken, (req, res) => {
    const { id } = req.params;
    const { employee, type } = req.body;

    if (!type) {
        return res.status(400).send('Type is required');
    }

    let projects = readProjects(type);
    let project = projects.find(p => p.id === id);

    if (!project) {
        return res.status(404).send('Project not found');
    }

    if (!project.employees.includes(employee)) {
        project.employees.push(employee);
    }

    writeProjects(type, projects);
    res.status(200).send('Employee added successfully');
});

app.delete('/projects/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const { type } = req.query;

    if (!type) {
        return res.status(400).send('Type is required');
    }

    let projects = readProjects(type);
    const updatedProjects = projects.filter(p => p.id !== id);

    writeProjects(type, updatedProjects);

    res.status(200).send('Project deleted successfully');
});

app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).send('Internal Server Error');
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}/`);
});
