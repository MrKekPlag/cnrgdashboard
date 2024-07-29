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

app.delete('/projects/:id', authenticateToken, (req, res) => {
    try {
        const { id } = req.params;
        const type = req.query.type;

        if (!type) {
            console.error('Type is required');
            return res.status(400).send('Type is required');
        }

        let projects = readProjects(type);
        const projectIndex = projects.findIndex(p => p.id === id);
        if (projectIndex === -1) {
            console.error('Project not found');
            return res.status(404).send('Project not found');
        }

        projects.splice(projectIndex, 1);
        writeProjects(type, projects);

        res.status(200).send({ message: 'Project deleted successfully' });
    } catch (error) {
        console.error('Error deleting project:', error);
        res.status(500).send('Internal Server Error');
    }
});

app.get('/auth/users', authenticateToken, (req, res) => {
    const userList = users.map(user => ({ firstName: user.firstName, lastName: user.lastName }));
    res.json(userList);
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

function createNewProjectTemplate(projectName, projectId, employees, goals, dependencies, startDate, endDate, rating = 0, customerRating = "Нет", deadline) {
    return {
        name: projectName,
        id: projectId,
        employees: employees,
        goals: goals.map(goal => ({
            ...goal,
            deadline: deadline || goal.deadline || ""
        })),
        dependencies: dependencies,
        startDate: startDate,
        endDate: endDate,
        rating: rating,
        customerRating: customerRating,
        deadline: deadline
    };
}

app.get('/projects', authenticateToken, (req, res) => {
    let projects = readProjects('projects');
    res.json(projects);
});

app.get('/projects/generation', authenticateToken, (req, res) => {
    let generationProjects = readProjects('generation');
    console.log(`Returning generation projects:`, generationProjects);
    res.json(generationProjects);
});

app.get('/projects/realization', authenticateToken, (req, res) => {
    let realizationProjects = readProjects('realization');
    res.json(realizationProjects);
});

app.get('/projects/all', authenticateToken, (req, res) => {
    let allProjects = readProjects('projects')
        .concat(readProjects('generation'))
        .concat(readProjects('realization'));
    res.json(allProjects);
});

app.post('/createProjectFile', authenticateToken, (req, res) => {
    const projectData = req.body;

    let projectsFile = 'projects';
    if (projectData.type === 'generation') {
        projectsFile = 'generationProjects';
    } else if (projectData.type === 'realization') {
        projectsFile = 'realizationProjects';
    }

    const projectsPath = path.join(__dirname, `./data/${projectsFile}.json`);

    ensureFileExists(projectsPath, []);

    res.json({ message: 'File created successfully' });
});

app.post('/projects', authenticateToken, (req, res) => {
    const { name, id, employees, goals, dependencies, startDate, endDate, deadline, type } = req.body;

    const newProject = createNewProjectTemplate(name, id, employees, goals, dependencies, startDate, endDate, 0, "Нет", deadline);

    let projects = readProjects(type);
    projects.push(newProject);
    writeProjects(type, projects);

    if (dependencies && dependencies.length > 0) {
        updateDependenciesForProject(id, dependencies);
    }

    res.status(201).send(newProject);
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
    }

    writeProjects(type, projects);
    res.status(200).send('Project rating updated successfully');
});

// Маршрут для получения статусов
app.get('/statuses.json', (req, res) => {
    res.sendFile(path.join(__dirname, 'statuses.json'));
});

app.patch('/statuses', authenticateToken, (req, res) => {
    statuses = req.body;
    fs.writeFileSync('./statuses.json', JSON.stringify(statuses, null, 2));
    console.log('Statuses updated');
    res.status(200).send('Statuses updated successfully');
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

    project.finalCompletionDate = date;

    try {
        writeProjects(type, projects);
        console.log(`Completion date updated successfully for project ${projectId}`);
        res.json({ message: 'Completion date updated successfully' });
    } catch (err) {
        console.error('Error writing to file:', err);
        res.status(500).json({ error: 'Failed to update completion date' });
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
    const { newEmployee } = req.body;

    let projects = readProjects('projects');
    let project = projects.find(p => p.id === id);

    if (!project) {
        return res.status(404).send('Project not found');
    }

    if (!project.employees.includes(newEmployee)) {
        project.employees.push(newEmployee);
        writeProjects('projects', projects);
        res.status(200).send('Employee added successfully');
    } else {
        res.status(400).send('Employee already assigned to the project');
    }
});

app.patch('/projects/:id/remove-employee', authenticateToken, (req, res) => {
    const { id } = req.params;
    const { employeeToRemove } = req.body;

    let projects = readProjects('projects');
    let project = projects.find(p => p.id === id);

    if (!project) {
        return res.status(404).send('Project not found');
    }

    project.employees = project.employees.filter(employee => employee !== employeeToRemove);
    writeProjects('projects', projects);

    res.status(200).send('Employee removed successfully');
});

// Update dependencies when creating a new project
const updateDependenciesForProject = async (projectId, dependencies) => {
    try {
        const updateDependencyInFile = async (filePath, projectId, dependencyId) => {
            let projects = JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
            let project = projects.find(p => p.id === dependencyId);
            if (!project) return false;

            if (!project.dependencies) project.dependencies = [];
            if (!project.dependencies.includes(projectId)) {
                project.dependencies.push(projectId);
            }

            await fs.promises.writeFile(filePath, JSON.stringify(projects, null, 2));
            return true;
        };

        for (const dependencyId of dependencies) {
            await updateDependencyInFile(path.join(__dirname, 'data', 'projects.json'), projectId, dependencyId);
            await updateDependencyInFile(path.join(__dirname, 'data', 'generationProjects.json'), projectId, dependencyId);
            await updateDependencyInFile(path.join(__dirname, 'data', 'realizationProjects.json'), projectId, dependencyId);
        }
    } catch (err) {
        console.error('Error updating dependencies:', err);
        throw err;
    }
};

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
